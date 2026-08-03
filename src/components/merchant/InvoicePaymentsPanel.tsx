"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { formatCents } from "@/lib/format";
import StateBadge from "@/components/merchant/StateBadge";

interface InvoicePaymentRow {
  id: string;
  createdAt: string;
  method: string;
  status: string;
  grossAmountCents: number;
  processingFeeCents: number;
  refundedCents: number;
  source: string;
}

const OFFLINE_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "CHECK", label: "Check" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "CASH_APP", label: "Cash App" },
  { value: "EXTERNAL_TERMINAL", label: "External Terminal" },
  { value: "OTHER", label: "Other" },
];

export default function InvoicePaymentsPanel({
  invoiceId,
  payments,
  balanceCents,
  canRecordOffline,
  canRefund,
  canAcceptPayment,
}: {
  invoiceId: string;
  payments: InvoicePaymentRow[];
  balanceCents: number;
  canRecordOffline: boolean;
  canRefund: boolean;
  canAcceptPayment: boolean;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [refundingId, setRefundingId] = useState<string | null>(null);

  async function submitOfflinePayment() {
    const amountCents = Math.round(parseFloat(amount || "0") * 100);
    if (!amountCents || amountCents < 1) {
      toast.error("Please enter a valid amount.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/merchant/invoices/${invoiceId}/record-offline-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents, method, offlinePaymentDate: date, offlineReferenceNumber: reference || undefined, offlineNotes: notes || undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error || "Could not record this payment.");
        return;
      }
      toast.success("Payment recorded.");
      setShowForm(false);
      setAmount("");
      setReference("");
      setNotes("");
      router.refresh();
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function submitRefund(paymentId: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/merchant/invoices/${invoiceId}/payments/${paymentId}/refund`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error || "Could not process this refund.");
        return;
      }
      toast.success(data.pending ? "Refund submitted — it will update once confirmed." : "Refund processed.");
      setRefundingId(null);
      router.refresh();
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-6">
      <div className="px-6 py-4 border-b border-slate-50 flex items-center justify-between">
        <h4 className="text-sm font-bold text-slate-900">Payment history</h4>
        {canRecordOffline && canAcceptPayment && balanceCents > 0 && (
          <button onClick={() => setShowForm((v) => !v)} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50">
            {showForm ? "Cancel" : "Record Offline Payment"}
          </button>
        )}
      </div>

      {showForm && (
        <div className="px-6 py-4 border-b border-slate-50 bg-slate-50 grid grid-cols-2 gap-3">
          <input type="number" step="0.01" placeholder={`Amount (max $${(balanceCents / 100).toFixed(2)})`} value={amount} onChange={(e) => setAmount(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none" />
          <select value={method} onChange={(e) => setMethod(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none">
            {OFFLINE_METHODS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none" />
          <input placeholder="Reference # (optional)" value={reference} onChange={(e) => setReference(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none" />
          <input placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} className="col-span-2 px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none" />
          <button onClick={submitOfflinePayment} disabled={busy} className="col-span-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-50">
            {busy ? "Saving…" : "Save Payment"}
          </button>
        </div>
      )}

      {payments.length === 0 ? (
        <p className="px-6 py-8 text-center text-slate-400 text-sm">No payments recorded yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
            <tr>
              <th className="px-6 py-3 text-left">Date</th>
              <th className="px-6 py-3 text-left">Method</th>
              <th className="px-6 py-3 text-left">Status</th>
              <th className="px-6 py-3 text-right">Gross</th>
              <th className="px-6 py-3 text-right">Fee</th>
              <th className="px-6 py-3 text-right">Refunded</th>
              {canRefund && <th className="px-6 py-3 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {payments.map((p) => {
              const eligible = p.status === "SUCCEEDED" || p.status === "PARTIALLY_REFUNDED";
              return (
                <tr key={p.id}>
                  <td className="px-6 py-3">{new Date(p.createdAt).toLocaleDateString()}</td>
                  <td className="px-6 py-3">{p.method.replace(/_/g, " ")} <span className="text-xs text-slate-400">({p.source})</span></td>
                  <td className="px-6 py-3"><StateBadge state={p.status} /></td>
                  <td className="px-6 py-3 text-right">{formatCents(p.grossAmountCents)}</td>
                  <td className="px-6 py-3 text-right">{formatCents(p.processingFeeCents)}</td>
                  <td className="px-6 py-3 text-right">{formatCents(p.refundedCents)}</td>
                  {canRefund && (
                    <td className="px-6 py-3 text-right">
                      {eligible &&
                        (refundingId === p.id ? (
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => submitRefund(p.id)} disabled={busy} className="px-2 py-1 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                              Confirm
                            </button>
                            <button onClick={() => setRefundingId(null)} className="px-2 py-1 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-50">
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setRefundingId(p.id)} className="px-2 py-1 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50">
                            Refund
                          </button>
                        ))}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
