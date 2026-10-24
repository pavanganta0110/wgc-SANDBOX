"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

const STATUS_LABELS: Record<string, string> = {
  SENT: "Sent",
  RESENT: "Resent",
  FAILED: "Failed to send",
  QUEUED: "Queued",
  SUPPRESSED_MISSING_EMAIL: "Not sent — donor has no email",
};

export default function ExternalDonationReceiptCard({
  id,
  receiptStatus,
  receiptNumber,
  receiptSentAt,
  recipientEmail,
  canSend,
}: {
  id: string;
  receiptStatus: string | null;
  receiptNumber: string | null;
  receiptSentAt: string | null;
  recipientEmail: string | null;
  canSend: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [showCc, setShowCc] = useState(false);
  const [ccInput, setCcInput] = useState("");
  const sentBefore = Boolean(receiptSentAt);

  async function send() {
    setBusy(true);
    try {
      const res = await fetch(`/api/merchant/donations/external/${id}/receipt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ additionalRecipients: ccInput }),
      });
      const json = await res.json();
      if (!res.ok) return toast.error(json.error || "Could not send receipt");
      toast.success("Receipt sent");
      setCcInput("");
      setShowCc(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-100 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-900 mb-3">Receipt</h2>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-slate-400">Status</dt>
          <dd>{receiptStatus ? STATUS_LABELS[receiptStatus] || receiptStatus : "Not sent"}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">Receipt number</dt>
          <dd>{receiptNumber || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">Last sent</dt>
          <dd>{receiptSentAt ? new Date(receiptSentAt).toLocaleString() : "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">Donor email</dt>
          <dd>{recipientEmail || "—"}</dd>
        </div>
      </dl>
      {canSend && recipientEmail && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button onClick={send} disabled={busy} className="text-xs font-semibold text-indigo-600 hover:underline disabled:opacity-50">
            {busy ? "Sending…" : sentBefore ? "Resend receipt" : "Send receipt"}
          </button>
          <button type="button" onClick={() => setShowCc((v) => !v)} className="text-xs text-slate-400 hover:text-slate-600 hover:underline">
            {showCc ? "hide" : "+ also send to others"}
          </button>
          <a
            href={`/api/merchant/donations/external/${id}/receipt?inline=1`}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-semibold text-slate-600 hover:underline"
          >
            View receipt
          </a>
          {sentBefore && (
            <a href={`/api/merchant/donations/external/${id}/receipt`} className="text-xs font-semibold text-slate-600 hover:underline">
              Download receipt
            </a>
          )}
          {showCc && (
            <input
              type="text"
              value={ccInput}
              onChange={(e) => setCcInput(e.target.value)}
              placeholder="spouse@example.com, bookkeeper@example.com"
              className="w-64 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700"
            />
          )}
        </div>
      )}
      {canSend && !recipientEmail && <p className="mt-3 text-xs text-amber-600">Add a donor email to send a receipt.</p>}
    </section>
  );
}
