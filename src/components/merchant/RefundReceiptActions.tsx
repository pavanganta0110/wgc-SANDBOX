"use client";

import { useState } from "react";
import { Mail, FileText } from "lucide-react";
import toast from "react-hot-toast";

/** Email the donor a refund confirmation. The donor's email is filled in when we have it; staff can type another. */
export default function RefundReceiptActions({ refundId, defaultEmail = "", canEmail = true }: { refundId: string; defaultEmail?: string; canEmail?: boolean }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(defaultEmail);
  const [sending, setSending] = useState(false);

  async function send() {
    const typed = email.trim();
    if (!typed) {
      toast.error("Enter an email address.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/merchant/transactions/refunds/${refundId}/receipt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: typed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to send refund receipt");
      toast.success(`Refund receipt sent to ${data?.sentTo || typed}`);
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send refund receipt");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <a
          href={`/api/merchant/transactions/refunds/${refundId}/receipt-view`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <FileText className="w-4 h-4" /> View / print receipt
        </a>
        {canEmail && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Mail className="w-4 h-4" /> Email refund receipt
          </button>
        )}
      </div>
      {canEmail && open && (
        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="donor@example.com"
            className="flex-1 min-w-0 rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={send}
            disabled={sending}
            className="px-3 py-2 rounded-xl bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      )}
    </div>
  );
}
