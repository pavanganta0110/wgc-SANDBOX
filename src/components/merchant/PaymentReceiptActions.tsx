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
  const [printing, setPrinting] = useState(false);
  const receiptUrl = `/api/merchant/transactions/payments/${transferId}/receipt-view`;

  /**
   * Opens the browser's print dialog for the receipt PDF. The PDF is loaded into a hidden frame and printed from
   * there; where a browser can't print a PDF that way (or has no PDF viewer), it falls back to opening the PDF.
   */
  async function printReceipt() {
    setPrinting(true);
    try {
      const res = await fetch(receiptUrl);
      if (!res.ok) throw new Error("Receipt unavailable");
      const objectUrl = URL.createObjectURL(await res.blob());
      const frame = document.createElement("iframe");
      frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
      frame.src = objectUrl;
      frame.onload = () => {
        try {
          frame.contentWindow?.focus();
          frame.contentWindow?.print();
        } catch {
          window.open(objectUrl, "_blank", "noopener");
        }
        setTimeout(() => {
          frame.remove();
          URL.revokeObjectURL(objectUrl);
        }, 60_000);
      };
      document.body.appendChild(frame);
    } catch {
      window.open(receiptUrl, "_blank", "noopener");
    } finally {
      setPrinting(false);
    }
  }

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
        <button
          type="button"
          onClick={printReceipt}
          disabled={printing}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <Printer className="w-4 h-4" /> {printing ? "Preparing…" : "Print receipt"}
        </button>
        <button
          type="button"
          onClick={() => setEmailOpen((o) => !o)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Mail className="w-4 h-4" /> Email receipt
        </button>
      </div>
      <p className="text-center text-xs">
        <a href={receiptUrl} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-blue-600 underline">
          Open or download PDF
        </a>
      </p>
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
