'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { categoryLabel, merchantStatusLabel, TICKET_STATUSES, TICKET_PRIORITIES, TICKET_CATEGORIES } from '@/lib/support/ticketCategories';

interface Message {
  id: string;
  senderRole: string;
  senderEmail: string | null;
  body: string;
  isSystemEvent: boolean;
  isInternalNote: boolean;
  createdAt: string;
  attachments: { id: string; fileName: string; mimeType: string }[];
}

interface TicketDetail {
  id: string;
  ticketNumber: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  churchId: string;
  createdByEmail: string | null;
  assignedToAdminUserId: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
  messages: Message[];
}

export default function AdminTicketDetailPage() {
  const params = useParams();
  const ticketId = params.ticketId as string;

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [church, setChurch] = useState<{ id: string; name: string } | null>(null);
  const [creator, setCreator] = useState<{ name: string | null; email: string; role: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/support/tickets/${ticketId}`);
    if (res.ok) {
      const data = await res.json();
      setTicket(data.ticket);
      setChurch(data.church);
      setCreator(data.creator);
    }
    setLoading(false);
  }, [ticketId]);

  useEffect(() => {
    load();
  }, [load]);

  const patch = async (action: string, extra: Record<string, unknown> = {}) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/support/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      if (res.ok) await load();
    } finally {
      setSaving(false);
    }
  };

  const send = async () => {
    if (!body.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/admin/support/tickets/${ticketId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: body.trim(), isInternalNote }),
      });
      if (res.ok) {
        setBody('');
        setIsInternalNote(false);
        await load();
      }
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div className="text-sm text-slate-500">Loading…</div>;
  if (!ticket) return <div className="text-sm text-red-600">Ticket not found.</div>;

  const isClosed = ticket.status === 'RESOLVED' || ticket.status === 'CLOSED';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-slate-400">{ticket.ticketNumber}</span>
            <h2 className="text-lg font-bold text-slate-900">{ticket.subject}</h2>
          </div>
          <p className="text-xs text-slate-500">{categoryLabel(ticket.category)} · {merchantStatusLabel(ticket.status)} · Opened {new Date(ticket.createdAt).toLocaleString()}</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
          {ticket.messages.map((m) => (
            <div key={m.id} className={m.isSystemEvent ? 'text-center' : 'flex'}>
              {m.isSystemEvent ? (
                <span className="text-xs text-slate-400 italic mx-auto">{m.body}{m.isInternalNote ? ' (internal)' : ''}</span>
              ) : (
                <div
                  className={`max-w-[85%] rounded-xl px-4 py-3 ${
                    m.isInternalNote ? 'bg-amber-50 border border-amber-200' : m.senderRole === 'wgc_admin' ? 'bg-blue-50 ml-auto' : 'bg-slate-50'
                  }`}
                >
                  <div className="text-xs font-semibold text-slate-500 mb-1">
                    {m.senderRole === 'wgc_admin' ? `WGC Support (${m.senderEmail || 'admin'})` : m.senderEmail || 'Organization'} · {new Date(m.createdAt).toLocaleString()}
                    {m.isInternalNote && <span className="ml-2 text-amber-700 font-bold">INTERNAL NOTE</span>}
                  </div>
                  <div className="text-sm text-slate-800 whitespace-pre-wrap">{m.body}</div>
                  {m.attachments.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {m.attachments.map((a) => (
                        <div key={a.id} className="text-xs text-slate-500">📎 {a.fileName}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          <div className="border-t border-slate-100 pt-4">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              placeholder={isInternalNote ? 'Write an internal note (never seen by the organization)…' : 'Write a reply to the organization…'}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none mb-2"
            />
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                <input type="checkbox" checked={isInternalNote} onChange={(e) => setIsInternalNote(e.target.checked)} />
                Internal note only (never emailed or shown to the organization)
              </label>
              <button onClick={send} disabled={sending || !body.trim()} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-50">
                {sending ? 'Sending…' : isInternalNote ? 'Add Note' : 'Send Reply'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-900">Ticket Details</h3>
          <div className="text-xs space-y-1.5">
            <div className="flex justify-between"><span className="text-slate-500">Organization</span><span className="font-semibold text-slate-800">{church?.name || '—'}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Org ID</span><span className="font-mono text-slate-500">{ticket.churchId}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Created by</span><span className="font-semibold text-slate-800">{creator?.name || creator?.email || '—'}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Creator email</span><span className="text-slate-700">{creator?.email || '—'}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Creator role</span><span className="text-slate-700">{creator?.role || '—'}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Created</span><span className="text-slate-700">{new Date(ticket.createdAt).toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Updated</span><span className="text-slate-700">{new Date(ticket.updatedAt).toLocaleString()}</span></div>
            {ticket.resolvedAt && <div className="flex justify-between"><span className="text-slate-500">Resolved</span><span className="text-slate-700">{new Date(ticket.resolvedAt).toLocaleString()}</span></div>}
            {ticket.closedAt && <div className="flex justify-between"><span className="text-slate-500">Closed</span><span className="text-slate-700">{new Date(ticket.closedAt).toLocaleString()}</span></div>}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-900">Manage</h3>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Status</label>
            <select
              value={ticket.status}
              disabled={saving}
              onChange={(e) => patch('set_status', { status: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
            >
              {TICKET_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Priority</label>
            <select
              value={ticket.priority}
              disabled={saving}
              onChange={(e) => patch('set_priority', { priority: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
            >
              {TICKET_PRIORITIES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Category</label>
            <select
              value={ticket.category}
              disabled={saving}
              onChange={(e) => patch('set_category', { category: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
            >
              {TICKET_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            {!isClosed && (
              <button onClick={() => patch('resolve')} disabled={saving} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50">Mark Resolved</button>
            )}
            {isClosed && (
              <button onClick={() => patch('reopen')} disabled={saving} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50">Reopen</button>
            )}
            {!isClosed && (
              <button onClick={() => patch('close')} disabled={saving} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50">Close</button>
            )}
            {ticket.assignedToAdminUserId ? (
              <button onClick={() => patch('unassign')} disabled={saving} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50">Unassign</button>
            ) : (
              <button
                onClick={async () => {
                  const meRes = await fetch('/api/admin/profile');
                  const me = await meRes.json().catch(() => null);
                  if (me?.user?.id) await patch('assign', { adminUserId: me.user.id });
                }}
                disabled={saving}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50"
              >
                Assign to Me
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
