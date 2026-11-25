"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export interface InboxRowData {
  id: string;
  direction: string;
  fromEmail: string;
  fromName: string | null;
  subject: string;
  bodyText: string;
  receivedLabel: string;
  classification: string;
  reason: string;
  status: string;
  assignedTo: string | null;
  ticketId: string | null;
  ticketNumber: string | null;
  churchId: string | null;
  churchName: string | null;
}

export default function InboxMessageRow({ m, orgs }: { m: InboxRowData; orgs: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [churchId, setChurchId] = useState(m.churchId ?? "");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(url: string, body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(json.error || "Failed");
    setReply("");
    router.refresh();
  }
  const act = (action: string, extra: Record<string, unknown> = {}) => call(`/api/admin/inbox/messages/${m.id}/action`, { action, ...extra });

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button onClick={() => setOpen(!open)} className="flex w-full items-start justify-between gap-3 p-4 text-left">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{m.direction === "OUT" ? "↗ You → " : ""}{m.subject}</p>
          <p className="truncate text-xs text-slate-500">{m.fromName ? `${m.fromName} · ` : ""}{m.fromEmail}{m.churchName ? ` · ${m.churchName}` : ""}</p>
          <p className="mt-1 text-xs text-slate-400">{m.reason}</p>
        </div>
        <div className="shrink-0 text-right text-xs text-slate-500">
          <p>{m.receivedLabel}</p>
          {m.ticketNumber && <p className="font-semibold text-emerald-700">{m.ticketNumber}</p>}
          {m.assignedTo && <p>→ {m.assignedTo}</p>}
        </div>
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-100 p-4">
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-800">{m.bodyText || "(empty)"}</pre>
          <div className="flex flex-wrap items-center gap-2">
            {!m.ticketId && m.direction === "IN" && (
              <>
                <select value={churchId} onChange={(e) => setChurchId(e.target.value)} className="max-w-xs rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
                  <option value="">Pick organization…</option>
                  {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                <button disabled={busy || !churchId} onClick={() => act("make_ticket", { churchId })} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">Make ticket</button>
              </>
            )}
            {m.ticketId && <Link href={`/admin/support/tickets/${m.ticketId}`} className="rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800">Open ticket {m.ticketNumber}</Link>}
            {m.direction === "IN" && m.classification !== "SPAM" && <button disabled={busy} onClick={() => act("spam")} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700">Spam</button>}
            {m.classification === "SPAM" && <button disabled={busy} onClick={() => act("not_spam")} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700">Not spam</button>}
            {m.direction === "IN" && <button disabled={busy} onClick={() => act("assign_me")} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700">Assign to me</button>}
            {m.direction === "IN" && m.status !== "IGNORED" && <button disabled={busy} onClick={() => act("ignore")} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700">Ignore</button>}
          </div>
          {m.direction === "IN" && (
            <div className="space-y-2">
              <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={4} placeholder={`Reply to ${m.fromEmail} (sent from your support address)`} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <button disabled={busy || !reply.trim()} onClick={() => call(`/api/admin/inbox/messages/${m.id}/reply`, { text: reply })} className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50">Send reply</button>
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
