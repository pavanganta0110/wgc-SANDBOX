"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/format";
import { toastSuccess, toastApiError } from "@/lib/support/toast";

export default function IssueRefundButton({
  transferId,
  maxAmountCents,
}: {
  transferId: string;
  maxAmountCents: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState((maxAmountCents / 100).toFixed(2));
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const amountCents = Math.round(parseFloat(amount) * 100);
    if (!amountCents || amountCents <= 0 || amountCents > maxAmountCents) {
      toastApiError("The refund amount cannot exceed the remaining refundable balance.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/merchant/transactions/payments/${transferId}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents }),
      });
      const data = await res.json();
      if (!res.ok) {
        toastApiError(data);
        return;
      }

      toastSuccess("Refund issued", "The refund has been successfully initiated.");
      setOpen(false);
      router.refresh();
    } catch (err: any) {
      toastApiError(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-sm font-semibold text-blue-600 hover:underline">
        Issue Refund
      </button>
    );
  }

  return (
    <div className="bg-slate-50 rounded-xl p-3 space-y-2">
      <label className="block text-xs font-semibold text-slate-500">Refund Amount</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min="0.01"
          max={maxAmountCents / 100}
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-24 px-2 py-1.5 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-[#eab308]"
        />
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold disabled:opacity-50"
        >
          {submitting ? "Refunding..." : "Confirm Refund"}
        </button>
        <button onClick={() => setOpen(false)} className="px-2 py-1.5 text-xs text-slate-500 hover:text-slate-900">
          Cancel
        </button>
      </div>
    </div>
  );
}
