"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { mountFinixPaymentForm } from "@/lib/finix/tokenize";
import type { FinixPaymentFormInstance } from "@/lib/finix/fraudSession";

const APPLICATION_ID = process.env.NEXT_PUBLIC_FINIX_APPLICATION_ID || "";
const CONSENT_TEXT =
  "I confirm that I am authorized to change this organization's payout bank account. I understand that the change may require review and that payouts already scheduled or processing may continue to the current bank account.";

interface CurrentAccount {
  bankName: string | null;
  last4: string | null;
  accountType: string | null;
}

export default function ChangeBankAccountFlow({
  current,
  hasPendingFunding,
  onClose,
  onSubmitted,
}: {
  current: CurrentAccount | null;
  hasPendingFunding: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [step, setStep] = useState<"collect" | "review" | "submitting" | "done">("collect");
  const [formReady, setFormReady] = useState(false);
  const [changeReason, setChangeReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const formInstanceRef = useRef<FinixPaymentFormInstance | null>(null);
  const idempotencyKeyRef = useRef<string>(`payout-change-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    if (!APPLICATION_ID) return;
    let cancelled = false;
    mountFinixPaymentForm("change-bank-account-finix-form", APPLICATION_ID, { paymentMethods: ["bank"], showAddress: false })
      .then((instance) => {
        if (cancelled) return;
        formInstanceRef.current = instance;
        setFormReady(true);
      })
      .catch(() => {
        if (!cancelled) toast.error("Could not load the secure bank form. Please refresh and try again.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const tokenizeAndReview = () => {
    if (!formInstanceRef.current || !formReady) {
      toast.error("The secure form is still loading — please wait a moment");
      return;
    }
    formInstanceRef.current.submit((error, response) => {
      if (error || !response?.data?.id) {
        toast.error("Could not process those bank details. Please check them and try again.");
        return;
      }
      setPendingToken(response.data.id);
      setStep("review");
    });
  };

  const submitChange = async () => {
    if (!confirmed || !pendingToken) return;
    setStep("submitting");
    try {
      const res = await fetch("/api/merchant/organization/bank-account/change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          finixToken: pendingToken,
          changeReason: changeReason.trim() || undefined,
          idempotencyKey: idempotencyKeyRef.current,
          consentSnapshot: CONSENT_TEXT,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit payout bank account change");
      setStep("done");
      onSubmitted();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit payout bank account change");
      setStep("review");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="text-sm font-bold text-slate-900 mb-1">Change Payout Bank Account</h3>
        <p className="text-xs text-slate-500 mb-4">
          This securely submits a new payout bank account for verification. Your current payout account stays active until the change is approved.
        </p>

        {hasPendingFunding && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-800">
            You have settlements or deposits currently in progress. Already-created payouts will continue to your current bank account and will not be affected by this change.
          </div>
        )}

        {step === "collect" && (
          <>
            <div className="mb-4">
              <p className="text-xs font-semibold text-slate-500 mb-1">Current Payout Account</p>
              <p className="text-sm text-slate-800">
                {current ? `${current.bankName || "Bank on file"} ••••${current.last4 || "----"}` : "None on file"}
              </p>
            </div>
            <div id="change-bank-account-finix-form" className="min-h-[180px] border border-slate-200 rounded-xl p-3 mb-4" />
            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-500 mb-1">Reason for Change (optional)</label>
              <textarea
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-slate-400"
                rows={2}
                value={changeReason}
                onChange={(e) => setChangeReason(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600">
                Cancel
              </button>
              <button onClick={tokenizeAndReview} disabled={!formReady} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-50">
                Continue
              </button>
            </div>
          </>
        )}

        {step === "review" && (
          <>
            <div className="space-y-3 mb-4">
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1">Current Payout Account</p>
                <p className="text-sm text-slate-800">{current ? `${current.bankName || "Bank on file"} ••••${current.last4 || "----"}` : "None on file"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1">New Account</p>
                <p className="text-sm text-slate-800">Submitted securely — details tokenized, not stored in plain text.</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-600 space-y-1">
                <p>This account requires processor verification before it can receive payouts.</p>
                <p>After it's approved and activated, it will be used for future eligible payouts. Payouts already scheduled or processing may continue to the previous account.</p>
                <p>Review may take some time — no action is needed from you while it's in progress.</p>
              </div>
            </div>
            <label className="flex items-start gap-2 text-xs text-slate-600 mb-4">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
              {CONSENT_TEXT}
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={() => setStep("collect")} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600">
                Back
              </button>
              <button onClick={submitChange} disabled={!confirmed} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-50">
                Submit
              </button>
            </div>
          </>
        )}

        {step === "submitting" && <p className="text-sm text-slate-500 py-8 text-center">Submitting…</p>}

        {step === "done" && (
          <div className="text-center py-6">
            <p className="text-sm font-semibold text-slate-900 mb-2">Your new payout bank account has been submitted</p>
            <p className="text-xs text-slate-500 mb-4">It's now under review. Your current payout account remains active until the new account is approved.</p>
            <button onClick={onClose} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold">
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
