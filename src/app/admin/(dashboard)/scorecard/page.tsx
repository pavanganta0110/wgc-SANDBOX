'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import type { AdminLeadRow, LeadStatus } from '@/lib/scorecard/adminRows';

const STATUS_LABELS: Record<LeadStatus, string> = {
  NOT_PURCHASED: 'Scored only',
  CHECKING: 'Checking payment',
  HELD: 'Payment not confirmed',
  SENDING: 'Sending report',
  SENT: 'Report sent',
  FAILED: 'Report failed',
};

const STATUS_STYLES: Record<LeadStatus, string> = {
  NOT_PURCHASED: 'bg-slate-100 text-slate-700',
  CHECKING: 'bg-amber-50 text-amber-700',
  HELD: 'bg-orange-50 text-orange-700',
  SENDING: 'bg-blue-50 text-blue-700',
  SENT: 'bg-emerald-50 text-emerald-700',
  FAILED: 'bg-red-50 text-red-700',
};

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—');

export default function ScorecardLeadsPage() {
  const [leads, setLeads] = useState<AdminLeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('ALL');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [open, setOpen] = useState<string | null>(null);

  const query = useCallback(() => {
    const params = new URLSearchParams();
    if (status !== 'ALL') params.set('status', status);
    if (q.trim()) params.set('q', q.trim());
    params.set('sort', sort);
    return params.toString();
  }, [q, status, sort]);

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      setError('');
      fetch(`/api/admin/scorecard/leads?${query()}`)
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Could not load the leads.'))))
        .then((data) => {
          setLeads(data.leads || []);
          setTotal(data.total || 0);
        })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const sold = leads.filter((l) => l.status === 'SENT').length;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Scorecard Leads</h1>
          <p className="text-sm text-slate-500">
            People who took the fundraising scorecard at fund.wgcpayments.com. {total} in all · {sold} paid reports in this view.
          </p>
        </div>
        <a
          href={`/api/admin/scorecard/leads/export?${query()}`}
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
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none bg-white">
          <option value="ALL">All statuses</option>
          {(Object.keys(STATUS_LABELS) as LeadStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as 'newest' | 'oldest')} className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none bg-white">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">{error}</div>
      ) : loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">Loading…</div>
      ) : leads.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">No leads yet.</div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {['Name & email', 'Organization', 'Scores', 'Report', 'Date', ''].map((h) => (
                  <th key={h} className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {leads.map((l) => (
                <Fragment key={l.id}>
                  <tr className="hover:bg-slate-50 transition-colors align-top">
                    <td className="px-5 py-4">
                      <div className="font-medium text-slate-900">{l.name || '—'}</div>
                      <div className="text-sm text-slate-500">{l.email}</div>
                      {l.unsubscribed && <div className="text-xs text-red-600 mt-1">Unsubscribed</div>}
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-medium text-slate-700">{l.organization || '—'}</div>
                      <div className="text-sm text-slate-500">{l.role}</div>
                      {l.source !== 'self' && <div className="text-xs text-slate-400 mt-1">Invited as {l.source}</div>}
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-700">
                      <div>Fundraising {l.fundraisingScore || '—'}/100</div>
                      <div className="text-slate-500">Pitch {l.pitchScore ? `${l.pitchScore}/100` : '—'}</div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[l.status]}`}>{STATUS_LABELS[l.status]}</span>
                      {l.statusReason && <div className="text-xs text-slate-400 mt-1 max-w-[220px] break-words">{l.statusReason}</div>}
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-500 whitespace-nowrap">{new Date(l.createdAt).toLocaleDateString()}</td>
                    <td className="px-5 py-4 text-right">
                      <button type="button" onClick={() => setOpen(open === l.id ? null : l.id)} className="text-sm font-medium text-blue-600 hover:text-blue-800">
                        {open === l.id ? 'Hide' : 'Details'}
                      </button>
                    </td>
                  </tr>
                  {open === l.id && (
                    <tr className="bg-slate-50">
                      <td colSpan={6} className="px-5 py-4">
                        <div className="grid md:grid-cols-2 gap-4 text-sm">
                          <div>
                            <div className="font-semibold text-slate-700 mb-2">Contact</div>
                            <div className="text-slate-600">Phone: {l.phone || '—'}</div>
                            <div className="text-slate-600">Data-use OK: {l.dataConsent || '—'}</div>
                            <div className="text-slate-600">Last scored: {fmt(l.lastScoredAt)}</div>
                            <div className="text-slate-600">Results email: {fmt(l.resultsEmailAt)}</div>
                            <div className="text-slate-600">Follow-ups sent: {l.followUpsSent.length ? l.followUpsSent.join(', ') : 'none'}</div>
                            <div className="text-slate-600">Payment id: {l.transferId || '—'}</div>
                            <div className="text-slate-600">Report sent: {fmt(l.reportSentAt)}</div>
                          </div>
                          <div>
                            <div className="font-semibold text-slate-700 mb-2">Areas</div>
                            {l.areaScores.map((a) => (
                              <div key={a.key} className="mb-2">
                                <div className="text-slate-700">
                                  {a.name}: <b>{a.score || '—'}</b>
                                  {a.score && a.score !== 'not sure' ? '/5' : ''}
                                </div>
                                {a.answer && <div className="text-slate-500 whitespace-pre-wrap">{a.answer}</div>}
                              </div>
                            ))}
                            {l.pitch && (
                              <div className="mt-3">
                                <div className="font-semibold text-slate-700">Pitch</div>
                                <div className="text-slate-500 whitespace-pre-wrap">{l.pitch}</div>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
