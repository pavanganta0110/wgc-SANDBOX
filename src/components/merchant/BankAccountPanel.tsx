"use client";

import { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import StateBadge from "@/components/merchant/StateBadge";
import ChangeBankAccountFlow from "@/components/merchant/ChangeBankAccountFlow";
import { formatCents } from "@/lib/format";

interface Account {
  source: string;
  isHistoricalFallback: boolean;
  bankName: string | null;
  accountHolderName: string | null;
  last4: string | null;
  accountType: string | null;
  displayStatus: string;
  addedAt: string | null;
}

interface PendingFunding {
  accruingSettlements: number;
  processingSettlements: number;
  scheduledDeposits: number;
  processingDeposits: number;
  failedOrReturnedDeposits: number;
  hasAnyPending: boolean;
}

interface PendingChange {
  id: string;
  last4: string | null;
  accountType: string | null;
  displayStatus: string;
  submittedAt: string;
  verifiedAt: string | null;
  failureMessageSafe: string | null;
}

interface HistoryRow {
  id: string;
  bankName: string | null;
  accountHolderName: string | null;
  last4: string | null;
  accountType: string | null;
  displayStatus: string;
  addedAt: string;
  activatedAt: string | null;
  replacedAt: string | null;
  depositsReceived: number;
  lastDepositAt: string | null;
  changeReason: string | null;
}

interface LatestDeposit {
  arrivedAt: string | null;
  amountCents: number | null;
  fundingSpeed: string | null;
}

interface FailedPayout {
  id: string;
  amountCents: number | null;
  failureCode: string | null;
  failureMessage: string | null;
  createdAtFinix: string | null;
  retriedAt: string | null;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="font-semibold text-slate-800">{value}</p>
    </div>
  );
}

const PENDING_CHANGE_MESSAGES: Record<string, string> = {
  SUBMITTED: "Your new payout bank account has been submitted.",
  VALIDATION_PENDING: "Your new payout bank account is under review. Your current payout account remains active until the new account is approved.",
  UNDER_REVIEW: "Your new payout bank account is under review. Your current payout account remains active until the new account is approved.",
  REQUIRES_ACTION: "Additional information is required before this account can be activated.",
  VERIFIED: "Your new payout bank account has been approved. WGC is confirming activation as your future payout destination.",
  REJECTED: "The bank account could not be approved. Review the information or contact WGC Support.",
};

export default function BankAccountPanel({
  canUpdateBankAccount,
  initialAccount,
  pendingFunding,
  latestDeposit,
  failedPayouts,
}: {
  canUpdateBankAccount: boolean;
  initialAccount: Account | null;
  pendingFunding: PendingFunding;
  latestDeposit: LatestDeposit | null;
  failedPayouts: FailedPayout[];
}) {
  const [account, setAccount] = useState(initialAccount);
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState(false);
  const [showChangeFlow, setShowChangeFlow] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const loadChangeStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/merchant/organization/bank-account/change-status");
      if (!res.ok) return;
      const data = await res.json();
      setPendingChange(data.pendingChange);
    } catch {
      /* non-blocking */
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(false);
    try {
      const res = await fetch("/api/merchant/organization/bank-account/history");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setHistory(data.history);
    } catch {
      setHistoryError(true);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      await fetch("/api/merchant/organization/bank-account/reconcile", { method: "POST" });
    } catch {
      /* best-effort */
    }
    loadChangeStatus();
    loadHistory();
  }, [loadChangeStatus, loadHistory]);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retryPayout = async (id: string) => {
    if (!window.confirm("Retry this payout using your current active payout bank account?")) return;
    setRetryingId(id);
    try {
      const res = await fetch("/api/merchant/organization/bank-account/retry-payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fundingTransferAttemptId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to retry payout");
      toast.success("Payout retry submitted");
    } catch (err: any) {
      toast.error(err.message || "Failed to retry payout");
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-900">Payout Bank Account</h3>
          {account && <StateBadge state={account.displayStatus} />}
        </div>

        {!account ? (
          <p className="text-sm text-slate-500">No payout bank account is on file for this organization yet.</p>
        ) : (
          <>
            {account.isHistoricalFallback && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-800">
                This account is shown from the most recent completed deposit, not a confirmed current mapping. Contact WGC Support if this looks incorrect.
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <Row label="Bank Name" value={account.bankName || "—"} />
              <Row label="Account Holder Name" value={account.accountHolderName || "—"} />
              <Row label="Account Type" value={account.accountType || "—"} />
              <Row label="Masked Account Number" value={account.last4 ? `••••${account.last4}` : "—"} />
              <Row label="Payout Destination State" value={account.displayStatus.replace(/_/g, " ")} />
              <Row label="Funding Speed" value={latestDeposit?.fundingSpeed || "—"} />
              <Row label="Added Date" value={account.addedAt ? new Date(account.addedAt).toLocaleDateString() : "—"} />
              <Row
                label="Latest Deposit"
                value={latestDeposit?.arrivedAt ? `${formatCents(latestDeposit.amountCents ?? 0)} on ${new Date(latestDeposit.arrivedAt).toLocaleDateString()}` : "—"}
              />
            </div>
            <p className="text-xs text-slate-400 mt-4">Full account and routing numbers are never displayed here for security.</p>
          </>
        )}
      </div>

      {pendingChange && (
        <div className="bg-white rounded-2xl border border-blue-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-slate-900">Payout Bank Account Change In Progress</h3>
            <StateBadge state={pendingChange.displayStatus} />
          </div>
          <p className="text-sm text-slate-600 mb-1">
            New account ending in ••••{pendingChange.last4 || "----"} submitted {new Date(pendingChange.submittedAt).toLocaleDateString()}.
          </p>
          <p className="text-sm text-slate-600">{PENDING_CHANGE_MESSAGES[pendingChange.displayStatus] || "Your current payout account remains active while this is reviewed."}</p>
          {pendingChange.failureMessageSafe && <p className="text-sm text-red-600 mt-2">{pendingChange.failureMessageSafe}</p>}
        </div>
      )}

      {canUpdateBankAccount && !pendingChange && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h3 className="text-sm font-bold text-slate-900 mb-2">Change Payout Bank Account</h3>
          <p className="text-xs text-slate-500 mb-3">
            After the new bank account is approved and activated, it will be used for future eligible payouts. Payouts already scheduled or processing may continue to the previous account.
          </p>
          <button onClick={() => setShowChangeFlow(true)} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold">
            Change Payout Bank Account
          </button>
        </div>
      )}

      {failedPayouts.length > 0 && (
        <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-6">
          <h3 className="text-sm font-bold text-slate-900 mb-1">Failed Payouts</h3>
          <p className="text-xs text-slate-500 mb-4">These payouts didn't complete. Review your bank account, then retry using your current active payout account.</p>
          <div className="divide-y divide-slate-50">
            {failedPayouts.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{formatCents(p.amountCents ?? 0)}</div>
                  <div className="text-xs text-slate-500">{p.failureMessage || p.failureCode || "Payout failed"} · {p.createdAtFinix ? new Date(p.createdAtFinix).toLocaleDateString() : ""}</div>
                </div>
                {p.retriedAt ? (
                  <span className="text-xs text-slate-400">Retried {new Date(p.retriedAt).toLocaleDateString()}</span>
                ) : canUpdateBankAccount ? (
                  <button
                    onClick={() => retryPayout(p.id)}
                    disabled={retryingId === p.id}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {retryingId === p.id ? "Retrying…" : "Retry Payout"}
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h3 className="text-sm font-bold text-slate-900 mb-4">Payout Account History</h3>
        {historyLoading ? (
          <div className="space-y-2">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-12 bg-slate-50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : historyError ? (
          <div className="text-sm text-red-600 flex items-center gap-2">
            Failed to load history.
            <button onClick={loadHistory} className="font-semibold text-blue-600 hover:underline">Retry</button>
          </div>
        ) : history.length === 0 ? (
          <p className="text-sm text-slate-500">No payout account changes recorded yet.</p>
        ) : (
          <div className="divide-y divide-slate-50">
            {history.map((row) => (
              <div key={row.id} className="py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      {row.bankName || "Bank account"} ••••{row.last4 || "----"}
                    </div>
                    <div className="text-xs text-slate-500">
                      Added {new Date(row.addedAt).toLocaleDateString()}
                      {row.activatedAt && ` · Active for future payouts since ${new Date(row.activatedAt).toLocaleDateString()}`}
                      {row.replacedAt && ` · Replaced ${new Date(row.replacedAt).toLocaleDateString()}`}
                      {" · "}
                      {row.depositsReceived} deposit{row.depositsReceived === 1 ? "" : "s"} received
                    </div>
                  </div>
                  <StateBadge state={row.displayStatus} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showChangeFlow && (
        <ChangeBankAccountFlow
          current={account ? { bankName: account.bankName, last4: account.last4, accountType: account.accountType } : null}
          hasPendingFunding={pendingFunding.hasAnyPending}
          onClose={() => setShowChangeFlow(false)}
          onSubmitted={() => {
            loadChangeStatus();
            loadHistory();
          }}
        />
      )}
    </div>
  );
}
