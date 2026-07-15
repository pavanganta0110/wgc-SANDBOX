"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { mountFinixPaymentForm } from "@/lib/finix/tokenize";
import type { FinixPaymentFormInstance } from "@/lib/finix/fraudSession";
import {
  PAYOUT_PROOF_ALLOWED_MIME_TYPES,
  PAYOUT_PROOF_ALLOWED_EXTENSIONS_LABEL,
  PAYOUT_PROOF_MAX_FILE_SIZE_BYTES,
  PAYOUT_PROOF_MAX_FILES,
  PAYOUT_PROOF_MAX_TOTAL_SIZE_BYTES,
} from "@/lib/uploads/payoutProofLimits";

const APPLICATION_ID = process.env.NEXT_PUBLIC_FINIX_APPLICATION_ID || "";
const CONSENT_TEXT =
  "I confirm that I am authorized to change this organization's payout bank account and that the submitted account and supporting documents are accurate.";
const PROOF_HELP_TEXT =
  "Upload proof of the payout account. Acceptable proof may include a recent bank statement or bank-issued document showing the account holder, account number, and routing number.";

interface CurrentAccount {
  bankName: string | null;
  last4: string | null;
  accountType: string | null;
}

interface PendingFunding {
  accruingSettlements: number;
  processingSettlements: number;
  scheduledDeposits: number;
  processingDeposits: number;
  failedOrReturnedDeposits: number;
  hasAnyPending: boolean;
}

interface NewAccountSummary {
  last4: string | null;
  accountType: string | null;
}

function formatAccountType(accountType: string | null): string {
  if (!accountType) return "Bank account";
  return accountType
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function ChangeBankAccountFlow({
  current,
  pendingFunding,
  onClose,
  onSubmitted,
}: {
  current: CurrentAccount | null;
  pendingFunding: PendingFunding;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [step, setStep] = useState<"collect" | "review" | "submitting" | "done">("collect");
  const [formReady, setFormReady] = useState(false);
  const [changeReason, setChangeReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [proofFiles, setProofFiles] = useState<File[]>([]);
  const [proofError, setProofError] = useState<string | null>(null);
  const [uploadWarning, setUploadWarning] = useState<string | null>(null);
  const [newAccountSummary, setNewAccountSummary] = useState<NewAccountSummary | null>(null);
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

  const addProofFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const incoming = Array.from(files);
    setProofError(null);

    const combined = [...proofFiles];
    for (const file of incoming) {
      if (!PAYOUT_PROOF_ALLOWED_MIME_TYPES.includes(file.type)) {
        setProofError(`"${file.name}" is not an accepted file type. Only ${PAYOUT_PROOF_ALLOWED_EXTENSIONS_LABEL} are allowed.`);
        continue;
      }
      if (file.size > PAYOUT_PROOF_MAX_FILE_SIZE_BYTES) {
        setProofError(`"${file.name}" is too large. Maximum size is ${PAYOUT_PROOF_MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB per file.`);
        continue;
      }
      if (combined.length >= PAYOUT_PROOF_MAX_FILES) {
        setProofError(`Maximum of ${PAYOUT_PROOF_MAX_FILES} files allowed.`);
        continue;
      }
      const totalSize = combined.reduce((sum, f) => sum + f.size, 0) + file.size;
      if (totalSize > PAYOUT_PROOF_MAX_TOTAL_SIZE_BYTES) {
        setProofError("Total upload size limit exceeded.");
        continue;
      }
      combined.push(file);
    }
    setProofFiles(combined);
  };

  const removeProofFile = (index: number) => {
    setProofFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const tokenizeAndReview = () => {
    if (!formInstanceRef.current || !formReady) {
      toast.error("The secure form is still loading — please wait a moment");
      return;
    }
    if (proofFiles.length === 0) {
      setProofError("Upload at least one supporting document before continuing.");
      return;
    }
    formInstanceRef.current.submit((error, response) => {
      if (error || !response?.data?.id) {
        toast.error("Could not process those bank details. Please check them and try again.");
        return;
      }
      setPendingToken(response.data.id);
      setNewAccountSummary({
        last4: response.data.masked_account_number ?? null,
        accountType: response.data.account_type ?? null,
      });
      setStep("review");
    });
  };

  const submitChange = async () => {
    if (!confirmed || !pendingToken) return;
    setStep("submitting");
    setUploadWarning(null);
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

      const accountId = data.account?.id;
      if (accountId && proofFiles.length > 0) {
        let failedCount = 0;
        for (const file of proofFiles) {
          try {
            const formData = new FormData();
            formData.append("file", file);
            const uploadRes = await fetch(`/api/merchant/organization/bank-account/${accountId}/documents`, {
              method: "POST",
              body: formData,
            });
            if (!uploadRes.ok) failedCount += 1;
          } catch {
            failedCount += 1;
          }
        }
        if (failedCount > 0) {
          setUploadWarning(
            `Your bank account change was submitted, but ${failedCount} of ${proofFiles.length} supporting document${proofFiles.length > 1 ? "s" : ""} could not be uploaded. Contact WGC Support to resend it.`
          );
        }
      }

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
              <label className="block text-xs font-semibold text-slate-500 mb-1">Supporting Bank Proof</label>
              <p className="text-xs text-slate-500 mb-2">{PROOF_HELP_TEXT}</p>
              <input
                type="file"
                multiple
                accept={PAYOUT_PROOF_ALLOWED_MIME_TYPES.join(",")}
                onChange={(e) => {
                  addProofFiles(e.target.files);
                  e.target.value = "";
                }}
                className="text-xs w-full"
              />
              {proofFiles.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {proofFiles.map((file, i) => (
                    <li key={`${file.name}-${i}`} className="flex items-center justify-between text-xs bg-slate-50 rounded-lg px-2 py-1">
                      <span className="truncate text-slate-700">{file.name}</span>
                      <button type="button" onClick={() => removeProofFile(i)} className="text-slate-400 hover:text-red-600 ml-2 font-semibold">
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {proofError && <p className="text-xs text-red-600 mt-1">{proofError}</p>}
              <p className="text-[11px] text-slate-400 mt-1">
                Up to {PAYOUT_PROOF_MAX_FILES} files, {PAYOUT_PROOF_MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB each ({PAYOUT_PROOF_ALLOWED_EXTENSIONS_LABEL}).
              </p>
            </div>

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
              <button
                onClick={tokenizeAndReview}
                disabled={!formReady || proofFiles.length === 0}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-50"
              >
                Review Change
              </button>
            </div>
          </>
        )}

        {step === "review" && (
          <>
            <div className="space-y-3 mb-4">
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1">Current Payout Account</p>
                <p className="text-sm text-slate-800">
                  {current
                    ? `${current.bankName || "Bank on file"} · ${formatAccountType(current.accountType)} · ••••${current.last4 || "----"}`
                    : "None on file"}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1">New Payout Account</p>
                <p className="text-sm text-slate-800">
                  {formatAccountType(newAccountSummary?.accountType ?? null)}
                  {newAccountSummary?.last4 ? ` · ••••${newAccountSummary.last4}` : " · tokenized securely"}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {proofFiles.length} supporting document{proofFiles.length === 1 ? "" : "s"} attached
                </p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-600 space-y-1">
                <p className="font-semibold text-slate-700">Payout Impact</p>
                {pendingFunding.hasAnyPending && (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    {pendingFunding.accruingSettlements + pendingFunding.processingSettlements > 0 && (
                      <div>Pending Settlements: <strong>{pendingFunding.accruingSettlements + pendingFunding.processingSettlements}</strong></div>
                    )}
                    {pendingFunding.scheduledDeposits > 0 && <div>Scheduled Deposits: <strong>{pendingFunding.scheduledDeposits}</strong></div>}
                    {pendingFunding.processingDeposits > 0 && <div>Processing Deposits: <strong>{pendingFunding.processingDeposits}</strong></div>}
                  </div>
                )}
                <p>Payouts already scheduled or processing may continue to the existing account.</p>
                <p>The new account is used only after review and activation.</p>
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
                Submit for Review
              </button>
            </div>
          </>
        )}

        {step === "submitting" && <p className="text-sm text-slate-500 py-8 text-center">Submitting…</p>}

        {step === "done" && (
          <div className="text-center py-6">
            <p className="text-sm font-semibold text-slate-900 mb-2">Your new payout bank account has been submitted</p>
            <p className="text-xs text-slate-500 mb-4">It's now under review. Your current payout account remains active until the new account is approved.</p>
            {uploadWarning && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 mb-4">{uploadWarning}</p>}
            <button onClick={onClose} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold">
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
