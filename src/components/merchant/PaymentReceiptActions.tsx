"use client";

import { useState } from "react";
import { Printer, Mail } from "lucide-react";
import toast from "react-hot-toast";

/**
 * Print / view and email a payment's receipt. Printing works whether or not a
 * receipt was ever emailed (a phone payment taken without a payer email has
 * none); emailing lets staff type an address when the payer has none on file.
 */
export default function PaymentReceiptActions({ transferId, defaultEmail = "" }: { transferId: string; defaultEmail?: string }) {
  const [emailOpen, setEmailOpen] = useState(false);
  const [email, setEmail] = useState(defaultEmail);
  const [sending, setSending] = useState(false);

  async function sendEmail() {
    const typed = email.trim();
    if (!typed) {
      toast.error("Enter an email address.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/merchant/transactions/payments/${transferId}/receipt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: typed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to send receipt");
      toast.success(`Receipt sent to ${typed}`);
      setEmailOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send receipt");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2 justify-center">
        <a
          href={`/api/merchant/transactions/payments/${transferId}/receipt-view`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Printer className="w-4 h-4" /> Print receipt
        </a>
        <button
          type="button"
          onClick={() => setEmailOpen((o) => !o)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Mail className="w-4 h-4" /> Email receipt
        </button>
      </div>
      {emailOpen && (
        <div className="flex gap-2 justify-center">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            className="w-56 rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={sendEmail}
            disabled={sending}
            className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      )}
    </div>
  );
}
