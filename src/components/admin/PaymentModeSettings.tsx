"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { RECEIPT_NOTE_MODES, type PaymentModeSettings as Settings, type ReceiptNoteMode } from "@/lib/settings/paymentMode";

const NOTE_MODE_LABELS: Record<ReceiptNoteMode, string> = {
  NONE: "Not shown on receipts",
  CUSTOMER: "On the payer's receipt",
  STAFF: "On the staff copy only",
  BOTH: "On both",
};

/** Admin-only panel: turns on the "payment processor" behaviors for one organization. */
export default function PaymentModeSettings({ churchId, settings }: { churchId: string; settings: Settings }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function save(patch: Partial<Settings>, message: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/merchants/${churchId}/payment-mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Something went wrong.");
      toast.success(message);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const toggles: { key: "paymentMode" | "termFieldEnabled" | "brandedDashboard"; title: string; description: string }[] = [
    {
      key: "paymentMode",
      title: "Payment mode",
      description: "Shows payer/payment wording instead of donor/donation/giving across the dashboard, payment links and receipts.",
    },
    {
      key: "termFieldEnabled",
      title: "Term field on Take a Payment",
      description: "Lets staff tag a payment with a term (for example a prior semester).",
    },
    {
      key: "brandedDashboard",
      title: "Branded dashboard",
      description: "Uses this organization's logo and colors (Settings → Branding) on its own dashboard.",
    },
  ];

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-4">
      <div>
        <p className="text-sm font-semibold text-gray-900">Payment processor mode</p>
        <p className="text-xs text-gray-500">For organizations using WGC as a general card processor. Everything is off by default.</p>
      </div>
      {toggles.map((t) => {
        const on = settings[t.key];
        return (
          <div key={t.key} className="flex items-center justify-between gap-4 border-t border-gray-100 pt-3">
            <div>
              <p className="text-sm font-medium text-gray-900">{t.title}</p>
              <p className="text-xs text-gray-500">{t.description}</p>
            </div>
            <button
              onClick={() => save({ [t.key]: !on }, `${t.title} turned ${on ? "off" : "on"}`)}
              disabled={busy}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60 ${on ? "bg-gray-600" : "bg-indigo-600"}`}
            >
              {on ? "Turn off" : "Turn on"}
            </button>
          </div>
        );
      })}
      <div className="flex items-center justify-between gap-4 border-t border-gray-100 pt-3">
        <div>
          <p className="text-sm font-medium text-gray-900">Payment note on receipts</p>
          <p className="text-xs text-gray-500">Where the note staff type on a payment is shown.</p>
        </div>
        <select
          value={settings.receiptNoteMode}
          disabled={busy}
          onChange={(e) => save({ receiptNoteMode: e.target.value as ReceiptNoteMode }, "Receipt note setting saved")}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-xs"
        >
          {RECEIPT_NOTE_MODES.map((m) => (
            <option key={m} value={m}>
              {NOTE_MODE_LABELS[m]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
