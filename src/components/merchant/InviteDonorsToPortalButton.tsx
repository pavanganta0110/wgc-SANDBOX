"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import toast from "react-hot-toast";

type Source = "ALL_DONORS" | "IMPORTED_CONTACTS";

interface Preview {
  sent: number; // in dry-run: how many would be sent
  remaining: number;
  maxPerRequest: number;
  skipped: { noEmail: number; optedOut: number; recentlyInvited: number; duplicate: number };
}

const SOURCE_LABELS: Record<Source, string> = {
  ALL_DONORS: "Everyone who has given",
  IMPORTED_CONTACTS: "Contacts from CSV import",
};

async function callInvites(source: Source, dryRun: boolean) {
  const res = await fetch("/api/merchant/donors/portal-invites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source, dryRun }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data as Preview & { failed: number };
}

export default function InviteDonorsToPortalButton() {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<Source>("ALL_DONORS");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);

  const loadPreview = async (s: Source) => {
    setSource(s);
    setPreview(null);
    setBusy(true);
    try {
      setPreview(await callInvites(s, true));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const openPanel = () => {
    setOpen(true);
    void loadPreview(source);
  };

  const send = async () => {
    setBusy(true);
    try {
      const r = await callInvites(source, false);
      toast.success(`Sent ${r.sent} invite${r.sent === 1 ? "" : "s"}${r.failed ? ` (${r.failed} failed)` : ""}`);
      if (r.remaining > 0) {
        toast(`${r.remaining} more are waiting — send again to continue.`);
        setPreview(await callInvites(source, true));
      } else {
        setOpen(false);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const skippedTotal = preview ? preview.skipped.noEmail + preview.skipped.optedOut + preview.skipped.recentlyInvited + preview.skipped.duplicate : 0;

  return (
    <>
      <button onClick={openPanel} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
        <Mail className="w-4 h-4" />
        Invite to Portal
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-slate-900">Invite donors to your giving portal</h3>
            <p className="mt-1 text-xs text-slate-500">
              Donors get an email with a link to see their giving, download statements and manage recurring gifts. They sign in with a one-time code sent to their email.
            </p>

            <label className="mt-4 block text-xs font-medium text-slate-600">
              Who to invite
              <select value={source} disabled={busy} onChange={(e) => loadPreview(e.target.value as Source)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                {(Object.keys(SOURCE_LABELS) as Source[]).map((s) => (
                  <option key={s} value={s}>{SOURCE_LABELS[s]}</option>
                ))}
              </select>
            </label>

            <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
              {!preview ? (
                <span className="text-slate-400">Counting…</span>
              ) : (
                <>
                  <p><strong>{preview.sent + preview.remaining}</strong> {preview.sent + preview.remaining === 1 ? "person" : "people"} will be emailed{preview.remaining > 0 ? ` (${preview.maxPerRequest} at a time)` : ""}.</p>
                  {skippedTotal > 0 && (
                    <p className="mt-1 text-xs text-slate-500">
                      Skipped: {preview.skipped.noEmail} without an email, {preview.skipped.optedOut} unsubscribed, {preview.skipped.recentlyInvited} already invited this week
                      {preview.skipped.duplicate > 0 ? `, ${preview.skipped.duplicate} duplicates` : ""}.
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setOpen(false)} disabled={busy} className="px-4 py-2 text-sm text-slate-600">Cancel</button>
              <button onClick={send} disabled={busy || !preview || preview.sent === 0} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {busy && preview ? "Sending…" : preview && preview.sent > 0 ? `Send ${preview.sent} invite${preview.sent === 1 ? "" : "s"}` : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
