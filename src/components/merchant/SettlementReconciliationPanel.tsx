"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import StateBadge from "@/components/merchant/StateBadge";
import { formatCents } from "@/lib/format";
import { formatDateTimeCDT as formatDateTime } from "@/lib/formatDateTimeCDT";
import { Row } from "@/components/merchant/detail/DetailDrawerPrimitives";

export default function SettlementReconciliationPanel({
  finixSettlementId,
  reconciliationStatus,
  reconciledAt,
  reconciledByEmail,
  reconciliationNotes,
  calculatedNetCents,
  processorNetCents,
  differenceCents,
  canManage,
}: {
  finixSettlementId: string;
  reconciliationStatus: string;
  reconciledAt: Date | null;
  reconciledByEmail: string | null;
  reconciliationNotes: string | null;
  calculatedNetCents: number;
  processorNetCents: number | null;
  differenceCents: number | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState(reconciliationNotes || "");
  const [saving, setSaving] = useState<string | null>(null);

  const act = async (status: string) => {
    setSaving(status);
    try {
      const res = await fetch(`/api/merchant/settlements/${finixSettlementId}/reconcile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, notes }),
      });
      if (!res.ok) throw new Error("Failed to update reconciliation status");
      toast.success("Reconciliation status updated");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to update reconciliation status");
    } finally {
      setSaving(null);
    }
  };

  const isMismatch = differenceCents != null && differenceCents !== 0;

  return (
    <div>
      <Row label="Status" value={<StateBadge state={reconciliationStatus} />} />
      <Row label="Calculated Net" value={formatCents(calculatedNetCents)} />
      <Row label="Processor Net" value={processorNetCents != null ? formatCents(processorNetCents) : "—"} />
      <Row
        label="Difference"
        value={
          differenceCents == null ? (
            "—"
          ) : (
            <span className={isMismatch ? "text-red-600" : "text-green-600"}>{formatCents(differenceCents)}</span>
          )
        }
      />
      {reconciledAt && <Row label="Reconciled" value={formatDateTime(reconciledAt)} />}
      {reconciledByEmail && <Row label="Reconciled By" value={reconciledByEmail} />}

      {canManage ? (
        <div className="mt-3">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Reconciliation notes"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => act("RECONCILED")}
              disabled={saving !== null}
              className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50"
            >
              {saving === "RECONCILED" ? "Confirming…" : "Confirm Reconciled"}
            </button>
            <button
              onClick={() => act("MISMATCH")}
              disabled={saving !== null}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {saving === "MISMATCH" ? "Saving…" : "Flag Mismatch"}
            </button>
            <button
              onClick={() => act("NEEDS_REVIEW")}
              disabled={saving !== null}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-800 disabled:opacity-50"
            >
              {saving === "NEEDS_REVIEW" ? "Saving…" : "Needs Review"}
            </button>
          </div>
        </div>
      ) : (
        reconciliationNotes && <p className="text-sm text-slate-600 whitespace-pre-wrap mt-2">{reconciliationNotes}</p>
      )}
    </div>
  );
}
