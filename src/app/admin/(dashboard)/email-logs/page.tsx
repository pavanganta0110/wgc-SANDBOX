'use client';

import { useEffect, useState, useCallback } from 'react';

interface EmailLogEntry {
  id: string;
  type: string;
  to: string;
  subject: string;
  status: string;
  error: string | null;
  sentAt: string | null;
  createdAt: string;
  bodyHtml: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  SENT: 'bg-emerald-50 text-emerald-700',
  FAILED: 'bg-red-50 text-red-700',
  ERROR: 'bg-red-50 text-red-700',
};

const RESENDABLE_TYPES = new Set([
  'ONBOARDING_SUBMITTED',
  'APPROVED',
  'MORE_INFORMATION_REQUIRED',
  'ADDITIONAL_INFO_NEEDED',
  'REJECTED',
  'DASHBOARD_ACCESS',
  'PASSWORD_RESET',
  'TEAM_INVITE',
]);

function isResendable(type: string) {
  return RESENDABLE_TYPES.has(type) || type.startsWith('ADMIN_RESEND_');
}

export default function EmailLogsPage() {
  const [logs, setLogs] = useState<EmailLogEntry[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('ALL');
  const [type, setType] = useState('ALL');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [viewingLog, setViewingLog] = useState<EmailLogEntry | null>(null);
  const [ccOpenForId, setCcOpenForId] = useState<string | null>(null);
  const [ccByLogId, setCcByLogId] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status !== 'ALL') params.set('status', status);
    if (type !== 'ALL') params.set('type', type);
    if (q.trim()) params.set('q', q.trim());
    params.set('sort', sort);
    fetch(`/api/admin/email-logs?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setLogs(data.logs || []);
        setTypes(data.types || []);
        setLoading(false);
      });
  }, [q, status, type, sort]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function resend(id: string) {
    setResendingId(id);
    setBanner(null);
    try {
      const res = await fetch(`/api/admin/email-logs/${id}/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ additionalRecipients: ccByLogId[id] || '' }),
      });
      const data = await res.json();
      if (res.ok) {
        setBanner({ kind: 'success', text: 'Email resent successfully.' });
      } else {
        setBanner({ kind: 'error', text: data.error || 'Failed to resend email.' });
      }
      load();
    } catch {
      setBanner({ kind: 'error', text: 'Failed to resend email.' });
    } finally {
      setResendingId(null);
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Email Logs</h1>
      <p className="text-sm text-slate-500 mb-6">Every transactional email WGC Payments has sent, with real delivery status.</p>

      {banner && (
        <div
          className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium ${
            banner.kind === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
          }`}
        >
          {banner.text}
        </div>
      )}

      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          placeholder="Search recipient or subject…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="flex-grow min-w-[240px] px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-blue-400"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none"
        >
          <option value="ALL">All types</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none"
        >
          <option value="ALL">All statuses</option>
          <option value="SENT">Sent</option>
          <option value="FAILED">Failed</option>
          <option value="ERROR">Error</option>
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
      ) : logs.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">No emails found.</div>
      ) : (
        <div className="space-y-3">
          {logs.map((log) => (
            <div key={log.id} className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="font-bold text-slate-900">{log.to}</p>
                    <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${STATUS_STYLES[log.status] || 'bg-slate-100 text-slate-600'}`}>
                      {log.status}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                      {log.type}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 truncate">{log.subject}</p>
                  {log.error && <p className="text-xs text-red-600 mt-1 truncate">{log.error}</p>}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <p className="text-xs text-slate-400">{new Date(log.createdAt).toLocaleString()}</p>
                  <div className="flex gap-2">
                    {log.bodyHtml && (
                      <button
                        onClick={() => setViewingLog(log)}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                      >
                        View
                      </button>
                    )}
                    {isResendable(log.type) && (
                      <>
                        <button
                          onClick={() => setCcOpenForId(ccOpenForId === log.id ? null : log.id)}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
                        >
                          {ccOpenForId === log.id ? 'Cancel' : '+ Also send to others'}
                        </button>
                        <button
                          onClick={() => resend(log.id)}
                          disabled={resendingId === log.id}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          {resendingId === log.id ? 'Resending…' : 'Resend'}
                        </button>
                      </>
                    )}
                  </div>
                  {ccOpenForId === log.id && (
                    <input
                      type="text"
                      autoFocus
                      value={ccByLogId[log.id] || ''}
                      onChange={(e) => setCcByLogId((prev) => ({ ...prev, [log.id]: e.target.value }))}
                      placeholder="also send to: name@example.com, name2@example.com"
                      className="w-64 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700"
                    />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {viewingLog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={() => setViewingLog(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 p-5 border-b border-slate-200">
              <div className="min-w-0">
                <p className="font-bold text-slate-900 truncate">{viewingLog.subject}</p>
                <p className="text-xs text-slate-500 mt-1">To: {viewingLog.to} · {new Date(viewingLog.createdAt).toLocaleString()}</p>
              </div>
              <button onClick={() => setViewingLog(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none px-1">×</button>
            </div>
            <div className="flex-1 overflow-auto p-2">
              {/* Sandboxed iframe, not dangerouslySetInnerHTML — this renders
                  the exact HTML that was actually sent, without letting any
                  script or link inside it execute in the admin page's own
                  context. */}
              <iframe
                title={`Email preview: ${viewingLog.subject}`}
                sandbox=""
                srcDoc={viewingLog.bodyHtml ?? ""}
                className="w-full h-[60vh] border-0"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
