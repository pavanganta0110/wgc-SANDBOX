"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Copy, X } from "lucide-react";

const FREQUENCIES = [
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "YEARLY", label: "Yearly" },
];

function newIdempotencyKey(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function SubscriptionActions({
  subscriptionId,
  finixSubscriptionId,
  displayStatus,
  currentAmountCents,
  currentBillingInterval,
  canCancel,
  canUpdateAmount,
  canUpdateFrequency,
  canSendPaymentUpdateLink,
}: {
  subscriptionId: string;
  finixSubscriptionId: string;
  displayStatus: string;
  currentAmountCents: number;
  currentBillingInterval: string | null;
  canCancel: boolean;
  canUpdateAmount: boolean;
  canUpdateFrequency: boolean;
  canSendPaymentUpdateLink: boolean;
}) {
  const router = useRouter();
  const [modal, setModal] = useState<"cancel" | "amount" | "frequency" | "payment-link" | null>(null);
  const [busy, setBusy] = useState(false);
  const [newAmount, setNewAmount] = useState((currentAmountCents / 100).toFixed(2));
  const [newFrequency, setNewFrequency] = useState(currentBillingInterval || "MONTHLY");
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  // Only ACTIVE (or PAST_DUE, for cancel/payment-update-link) schedules
  // support any mutation — Finix's own subscription API has no endpoints
  // for a canceled/completed schedule at all.
  const isActive = displayStatus === "ACTIVE";
  const isActionable = displayStatus === "ACTIVE" || displayStatus === "PAST_DUE";

  const close = () => {
    setModal(null);
    setBusy(false);
    setConsentConfirmed(false);
    setCancelReason("");
  };

  const doCancel = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/merchant/subscriptions/${subscriptionId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason || undefined, idempotencyKey: newIdempotencyKey("cancel") }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to cancel");
      toast.success("Subscription canceled");
      close();
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel");
      setBusy(false);
    }
  };

  const doUpdateAmount = async () => {
    const amountCents = Math.round(parseFloat(newAmount || "0") * 100);
    if (amountCents < 100) {
      toast.error("Please enter a valid amount");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/merchant/subscriptions/${subscriptionId}/update-amount`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newAmountCents: amountCents, consentConfirmed: true, idempotencyKey: newIdempotencyKey("update-amount") }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update amount");
      toast.success("Amount updated — a new subscription replaced the old one");
      close();
      router.push(`/merchant/subscriptions/${data.subscription.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to update amount");
      setBusy(false);
    }
  };

  const doUpdateFrequency = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/merchant/subscriptions/${subscriptionId}/update-frequency`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newBillingInterval: newFrequency, consentConfirmed: true, idempotencyKey: newIdempotencyKey("update-frequency") }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update frequency");
      toast.success("Frequency updated — a new subscription replaced the old one");
      close();
      router.push(`/merchant/subscriptions/${data.subscription.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to update frequency");
      setBusy(false);
    }
  };

  const doSendPaymentUpdateLink = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/merchant/subscriptions/${subscriptionId}/send-payment-update-link`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send link");
      toast.success("Payment update link sent to donor");
      close();
    } catch (err: any) {
      toast.error(err.message || "Failed to send link");
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={() => navigator.clipboard.writeText(finixSubscriptionId).then(() => toast.success("Subscription ID copied"))}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
      >
        <Copy className="w-3.5 h-3.5" /> Copy ID
      </button>
      {canUpdateAmount && isActive && (
        <button onClick={() => setModal("amount")} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          Update Amount
        </button>
      )}
      {canUpdateFrequency && isActive && (
        <button onClick={() => setModal("frequency")} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          Update Frequency
        </button>
      )}
      {canSendPaymentUpdateLink && isActionable && (
        <button onClick={() => setModal("payment-link")} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          Send Payment Update Link
        </button>
      )}
      {canCancel && isActionable && (
        <button onClick={() => setModal("cancel")} className="px-3 py-1.5 rounded-lg border border-red-200 text-xs font-semibold text-red-600 hover:bg-red-50">
          Cancel
        </button>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900">
                {modal === "cancel" && "Cancel Subscription"}
                {modal === "amount" && "Update Amount"}
                {modal === "frequency" && "Update Frequency"}
                {modal === "payment-link" && "Send Payment Update Link"}
              </h3>
              <button onClick={close}><X className="w-4 h-4 text-slate-400" /></button>
            </div>

            {modal === "cancel" && (
              <div className="space-y-3">
                <p className="text-sm text-slate-600">This immediately cancels the subscription with the processor. This cannot be undone, though the donor's donation history is preserved.</p>
                <textarea placeholder="Reason (optional)" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none" rows={2} />
                <div className="flex gap-2">
                  <button disabled={busy} onClick={doCancel} className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold disabled:opacity-50">
                    {busy ? "Canceling…" : "Confirm Cancel"}
                  </button>
                  <button onClick={close} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700">Never Mind</button>
                </div>
              </div>
            )}

            {modal === "amount" && (
              <div className="space-y-3">
                <p className="text-sm text-slate-600">
                  Finix has no in-place amount update — this cancels the current subscription and creates a new one with the updated amount. Old: <strong>${(currentAmountCents / 100).toFixed(2)}</strong>
                </p>
                <input type="text" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none" placeholder="New amount ($)" />
                <label className="flex items-start gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={consentConfirmed} onChange={(e) => setConsentConfirmed(e.target.checked)} className="mt-0.5" />
                  I confirm the donor authorized this new amount.
                </label>
                <div className="flex gap-2">
                  <button disabled={busy || !consentConfirmed} onClick={doUpdateAmount} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-50">
                    {busy ? "Updating…" : "Confirm Update"}
                  </button>
                  <button onClick={close} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700">Never Mind</button>
                </div>
              </div>
            )}

            {modal === "frequency" && (
              <div className="space-y-3">
                <p className="text-sm text-slate-600">This cancels the current subscription and creates a new one with the updated frequency.</p>
                <select value={newFrequency} onChange={(e) => setNewFrequency(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none">
                  {FREQUENCIES.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
                <label className="flex items-start gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={consentConfirmed} onChange={(e) => setConsentConfirmed(e.target.checked)} className="mt-0.5" />
                  I confirm the donor authorized this new frequency.
                </label>
                <div className="flex gap-2">
                  <button disabled={busy || !consentConfirmed} onClick={doUpdateFrequency} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-50">
                    {busy ? "Updating…" : "Confirm Update"}
                  </button>
                  <button onClick={close} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700">Never Mind</button>
                </div>
              </div>
            )}

            {modal === "payment-link" && (
              <div className="space-y-3">
                <p className="text-sm text-slate-600">Sends the donor a secure, single-use link to provide a new payment method. Completing it cancels this subscription and creates a replacement.</p>
                <div className="flex gap-2">
                  <button disabled={busy} onClick={doSendPaymentUpdateLink} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-50">
                    {busy ? "Sending…" : "Send Link"}
                  </button>
                  <button onClick={close} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700">Never Mind</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
