'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

interface Inquiry {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  company: string | null;
  subject: string | null;
  message: string;
  status: string;
  createdAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  NEW: 'bg-blue-50 text-blue-700',
  REVIEWED: 'bg-amber-50 text-amber-700',
  CONTACTED: 'bg-purple-50 text-purple-700',
  CLOSED: 'bg-slate-100 text-slate-600',
};

export default function InquiriesPage() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
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
    fetch(`/api/admin/inquiries?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setInquiries(data.inquiries || []);
        setLoading(false);
      });
  }, [q, status, sort]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Inquiries</h1>
      <p className="text-sm text-slate-500 mb-6">Submissions from the public contact form.</p>

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
          className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none"
        >
          <option value="ALL">All statuses</option>
          <option value="NEW">New</option>
          <option value="REVIEWED">Reviewed</option>
          <option value="CONTACTED">Contacted</option>
          <option value="CLOSED">Closed</option>
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as 'newest' | 'oldest')}
          className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </div>

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">Loading…</div>
      ) : inquiries.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">No inquiries found.</div>
      ) : (
        <div className="space-y-3">
          {inquiries.map((inq) => (
            <Link
              key={inq.id}
              href={`/admin/inquiries/${inq.id}`}
              className="block bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-bold text-slate-900">{inq.firstName} {inq.lastName}</p>
                    <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${STATUS_STYLES[inq.status] || 'bg-slate-100 text-slate-600'}`}>
                      {inq.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">{inq.email}{inq.company ? ` · ${inq.company}` : ''}</p>
                  <p className="text-sm text-slate-600 mt-2 truncate">{inq.subject || inq.message}</p>
                </div>
                <p className="text-xs text-slate-400 shrink-0">{new Date(inq.createdAt).toLocaleDateString()}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
