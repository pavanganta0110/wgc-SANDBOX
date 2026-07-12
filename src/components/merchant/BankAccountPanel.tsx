"use client";

import { useEffect, useState, useCallback } from "react";
import StateBadge from "@/components/merchant/StateBadge";
import ChangeBankAccountFlow from "@/components/merchant/ChangeBankAccountFlow";

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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="font-semibold text-slate-800">{value}</p>
    </div>
  );
}

export default function BankAccountPanel({
  canUpdateBankAccount,
  initialAccount,
  pendingFunding,
}: {
  canUpdateBankAccount: boolean;
  initialAccount: Account | null;
  pendingFunding: PendingFunding;
}) {
  const [account, setAccount] = useState(initialAccount);
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState(false);
  const [showChangeFlow, setShowChangeFlow] = useState(false);

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

  useEffect(() => {
    loadChangeStatus();
    loadHistory();
  }, [loadChangeStatus, loadHistory]);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-900">Bank Account on File</h3>
          {account && <StateBadge state={account.displayStatus} />}
        </div>

        {!account ? (
          <p className="text-sm text-slate-500">No bank account is on file for this organization yet.</p>
        ) : (
          <>
            {account.isHistoricalFallback && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-800">
                This account is shown from the most recent completed deposit, not a confirmed current mapping. Contact WGC Support if this looks incorrect.
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <Row label="Bank Name" value={account.bankName || "—"} />
              <Row label="Account Holder" value={account.accountHolderName || "—"} />
              <Row label="Account Type" value={account.accountType || "—"} />
              <Row label="Account Number" value={account.last4 ? `••••${account.last4}` : "—"} />
              <Row label="Date Added" value={account.addedAt ? new Date(account.addedAt).toLocaleDateString() : "—"} />
            </div>
            <p className="text-xs text-slate-400 mt-4">Full account and routing numbers are never displayed here for security.</p>
          </>
        )}
      </div>

      {pendingChange && (
        <div className="bg-white rounded-2xl border border-blue-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-slate-900">Bank Account Change In Progress</h3>
            <StateBadge state={pendingChange.displayStatus} />
          </div>
          <p className="text-sm text-slate-600">
            New account ending in ••••{pendingChange.last4 || "----"} submitted {new Date(pendingChange.submittedAt).toLocaleDateString()}. WGC Support will confirm when this becomes the active deposit destination.
          </p>
        </div>
      )}

      {canUpdateBankAccount && !pendingChange && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h3 className="text-sm font-bold text-slate-900 mb-2">Change Bank Account</h3>
          <p className="text-xs text-slate-500 mb-3">
            Bank account changes are reviewed by WGC Support before becoming active, to protect against fraud and keep deposits uninterrupted.
          </p>
          <button onClick={() => setShowChangeFlow(true)} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold">
            Change Bank Account
          </button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h3 className="text-sm font-bold text-slate-900 mb-4">Bank Account History</h3>
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
          <p className="text-sm text-slate-500">No bank account changes recorded yet.</p>
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
                      {row.activatedAt && ` · Activated ${new Date(row.activatedAt).toLocaleDateString()}`}
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
