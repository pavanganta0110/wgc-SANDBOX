'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { TICKET_STATUSES, TICKET_PRIORITIES, TICKET_CATEGORIES, categoryLabel, merchantStatusLabel } from '@/lib/support/ticketCategories';

interface TicketRow {
  id: string;
  ticketNumber: string;
  organizationName: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  createdByEmail: string | null;
  assignedAdminName: string | null;
  createdAt: string;
  updatedAt: string;
  unreadCount: number;
}

const PRIORITY_STYLES: Record<string, string> = {
  LOW: 'bg-slate-100 text-slate-600',
  NORMAL: 'bg-blue-50 text-blue-700',
  HIGH: 'bg-amber-50 text-amber-700',
  URGENT: 'bg-red-50 text-red-700',
};

export default function AdminSupportTicketsPage() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('OPEN');
  const [priority, setPriority] = useState('');
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');

  const load = useCallback((p: number) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status !== 'ALL') params.set('status', status);
    if (priority) params.set('priority', priority);
    if (category) params.set('category', category);
    if (q.trim()) params.set('q', q.trim());
    params.set('page', String(p));
    fetch(`/api/admin/support/tickets?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setTickets(data.rows || []);
        setTotal(data.total || 0);
        setPage(p);
        setLoading(false);
      });
  }, [status, priority, category, q]);

  useEffect(() => {
    const t = setTimeout(() => load(1), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, priority, category, q]);

  const pageSize = 25;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-slate-900">Support Tickets</h2>

      <div className="flex flex-wrap items-center gap-2">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm">
          <option value="OPEN">Open</option>
          <option value="CLOSED">Resolved/Closed</option>
          <option value="ALL">All Statuses</option>
          {TICKET_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm">
          <option value="">All Priorities</option>
          {TICKET_PRIORITIES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm">
          <option value="">All Categories</option>
          {TICKET_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search ticket #, subject, organization, or email"
          className="px-3 py-2 rounded-lg border border-slate-200 text-sm w-72"
        />
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        {loading ? (
          <div className="p-6 space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 bg-slate-50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : tickets.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">No tickets match these filters.</p>
        ) : (
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50">
                <th className="px-6 py-3">Ticket #</th>
                <th className="px-6 py-3">Organization</th>
                <th className="px-6 py-3">Subject</th>
                <th className="px-6 py-3">Category</th>
                <th className="px-6 py-3">Priority</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Created By</th>
                <th className="px-6 py-3">Assigned</th>
                <th className="px-6 py-3">Updated</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id} className="border-t border-slate-50 hover:bg-slate-50 cursor-pointer" onClick={() => (window.location.href = `/admin/support/tickets/${t.id}`)}>
                  <td className="px-6 py-3">
                    <Link href={`/admin/support/tickets/${t.id}`} className="font-mono text-xs text-blue-600 hover:underline flex items-center gap-1.5">
                      {t.ticketNumber}
                      {t.unreadCount > 0 && (
                        <span className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-blue-600 text-white text-[9px] font-bold">
                          {t.unreadCount}
                        </span>
                      )}
                    </Link>
                  </td>
                  <td className="px-6 py-3 text-slate-700">{t.organizationName}</td>
                  <td className="px-6 py-3 text-slate-900 font-medium">{t.subject}</td>
                  <td className="px-6 py-3 text-slate-600">{categoryLabel(t.category)}</td>
                  <td className="px-6 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${PRIORITY_STYLES[t.priority] || 'bg-slate-100 text-slate-600'}`}>{t.priority}</span>
                  </td>
                  <td className="px-6 py-3 text-slate-600">{merchantStatusLabel(t.status)}</td>
                  <td className="px-6 py-3 text-slate-500 text-xs">{t.createdByEmail || '—'}</td>
                  <td className="px-6 py-3 text-slate-500 text-xs">{t.assignedAdminName || 'Unassigned'}</td>
                  <td className="px-6 py-3 text-slate-500 text-xs">{new Date(t.updatedAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {total > pageSize && (
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Page {page} of {Math.max(1, Math.ceil(total / pageSize))}</span>
          <div className="flex gap-2">
            <button onClick={() => load(page - 1)} disabled={page <= 1} className="px-3 py-1 rounded-lg border border-slate-200 disabled:opacity-40">Previous</button>
            <button onClick={() => load(page + 1)} disabled={page * pageSize >= total} className="px-3 py-1 rounded-lg border border-slate-200 disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
