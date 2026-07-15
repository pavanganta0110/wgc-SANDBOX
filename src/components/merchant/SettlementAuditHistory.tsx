import { prisma } from "@/lib/prisma";
import { formatDateTimeCDT } from "@/lib/formatDateTimeCDT";

const ACTION_LABELS: Record<string, string> = {
  "settlement.reconciliation_confirmed": "Reconciliation confirmed",
  "settlement.reconciliation_overridden": "Reconciliation overridden",
  "settlement.export_performed": "CSV export performed",
  "settlement.manual_sync_triggered": "Manual sync triggered",
};

export default async function SettlementAuditHistory({ finixSettlementId, churchId }: { finixSettlementId: string; churchId: string }) {
  const entries = await prisma.dashboardAuditLog.findMany({
    where: { churchId, entityType: "settlement", entityId: finixSettlementId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  if (entries.length === 0) {
    return <p className="text-sm text-slate-400">No actions recorded yet.</p>;
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <div key={entry.id} className="flex items-start justify-between text-sm border-b border-slate-50 last:border-0 pb-2 last:pb-0">
          <div>
            <p className="font-semibold text-slate-800">{ACTION_LABELS[entry.action] || entry.action}</p>
            <p className="text-xs text-slate-400">
              {entry.actorEmail || "System"}
              {entry.actorRole && ` · ${entry.actorRole}`}
            </p>
          </div>
          <p className="text-xs text-slate-400 whitespace-nowrap">{formatDateTimeCDT(entry.createdAt)}</p>
        </div>
      ))}
    </div>
  );
}
