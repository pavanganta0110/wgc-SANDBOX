'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  normalizedEmail: string;
  organizationName: string;
  role: string;
  status: string;
  buildUpdatesPreference: string;
  createdAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  NEW: 'bg-blue-50 text-blue-700',
  CONTACTED: 'bg-amber-50 text-amber-700',
  QUALIFIED: 'bg-purple-50 text-purple-700',
  SESSION_SCHEDULED: 'bg-indigo-50 text-indigo-700',
  ATTENDED: 'bg-emerald-50 text-emerald-700',
  APPLICATION_STARTED: 'bg-green-50 text-green-700',
  CONVERTED: 'bg-teal-50 text-teal-700',
  NOT_INTERESTED: 'bg-slate-100 text-slate-600',
};

const STATUS_LABELS: Record<string, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  SESSION_SCHEDULED: 'Session Scheduled',
  ATTENDED: 'Attended',
  APPLICATION_STARTED: 'Application Started',
  CONVERTED: 'Converted',
  NOT_INTERESTED: 'Not Interested',
};

const PREF_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  OPTED_IN: 'Weekly Updates',
  SESSION_ONLY: 'Session Only',
};

export default function FirstLookLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('ALL');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status !== 'ALL') params.set('status', status);
    if (q.trim()) params.set('q', q.trim());
    params.set('sort', sort);
    fetch(`/api/admin/first-look-leads?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setLeads(data.leads || []);
        setLoading(false);
      });
  }, [q, status, sort]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">First Look Leads</h1>
          <p className="text-sm text-slate-500">Registrations for the First Look campaign.</p>
        </div>
        <a 
          href="/api/admin/first-look-leads/export"
          target="_blank"
          className="text-sm font-semibold bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-xl hover:bg-slate-50 transition-colors"
        >
          Export CSV
        </a>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          placeholder="Search name, email, organization…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="flex-grow min-w-[240px] px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-blue-400"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none bg-white"
        >
          <option value="ALL">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as 'newest' | 'oldest')}
          className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none bg-white"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </div>

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">Loading…</div>
      ) : leads.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">No leads found.</div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Name & Email</th>
                <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Organization</th>
                <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {leads.map((lead) => (
                <tr key={lead.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-4">
                    <div className="font-medium text-slate-900">{lead.firstName} {lead.lastName}</div>
                    <div className="text-sm text-slate-500">{lead.normalizedEmail}</div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="font-medium text-slate-700">{lead.organizationName}</div>
                    <div className="text-sm text-slate-500">{lead.role}</div>
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-500">
                    {new Date(lead.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[lead.status] || 'bg-slate-100 text-slate-800'}`}>
                      {STATUS_LABELS[lead.status] || lead.status}
                    </span>
                    <div className="text-xs text-slate-400 mt-1">{PREF_LABELS[lead.buildUpdatesPreference] || lead.buildUpdatesPreference}</div>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      href={`/admin/first-look-leads/${lead.id}`}
                      className="text-sm font-medium text-blue-600 hover:text-blue-800"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
