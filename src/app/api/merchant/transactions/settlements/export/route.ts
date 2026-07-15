import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import { resolveDateRange } from "@/lib/dateRangePresets";
import { buildCsvExport, csvResponse, type CsvColumn } from "@/lib/csvExport";
import { resolveSettlementDisplayStatus, getSettlementStatusLabel } from "@/lib/finix/settlementStatus";
import { getSettlementPermissions } from "@/lib/finix/settlementPermissions";
import { logDashboardAction } from "@/lib/dashboardAudit";

type SettlementExportRow = {
  settlement: Awaited<ReturnType<typeof prisma.finixSettlement.findMany>>[number];
  deposit: Awaited<ReturnType<typeof prisma.finixFundingTransferAttempt.findMany>>[number] | undefined;
};

function baseColumns(): CsvColumn<SettlementExportRow>[] {
  return [
    { header: "Settlement ID", value: (r) => r.settlement.finixSettlementId },
    { header: "Created", value: (r) => (r.settlement.createdAtFinix ? r.settlement.createdAtFinix.toISOString() : "") },
    { header: "Updated", value: (r) => (r.settlement.updatedAtFinix ? r.settlement.updatedAtFinix.toISOString() : "") },
    { header: "Status", value: (r) => getSettlementStatusLabel(resolveSettlementDisplayStatus(r.settlement)) },
    { header: "Gross Amount", value: (r) => formatCents(r.settlement.totalAmountCents ?? 0) },
    { header: "Fee Amount", value: (r) => formatCents(r.settlement.feeAmountCents ?? 0) },
    { header: "Refund Amount", value: (r) => formatCents(r.settlement.refundAmountCents ?? 0) },
    { header: "Return Amount", value: (r) => formatCents(r.settlement.returnAmountCents ?? 0) },
    { header: "Dispute Amount", value: (r) => formatCents(r.settlement.disputeAmountCents ?? 0) },
    { header: "Other Adjustments", value: (r) => (r.settlement.otherAdjustmentAmountCents != null ? formatCents(r.settlement.otherAdjustmentAmountCents) : "") },
    { header: "Net Amount", value: (r) => formatCents(r.settlement.netAmountCents ?? 0) },
    { header: "Transaction Count", value: (r) => String(r.settlement.transactionCount ?? 0) },
    { header: "Fee Count", value: (r) => String(r.settlement.feeCount ?? 0) },
    { header: "Refund Count", value: (r) => String(r.settlement.refundCount ?? 0) },
    { header: "Bank Return Count", value: (r) => String(r.settlement.bankReturnCount ?? 0) },
    { header: "Dispute Count", value: (r) => String(r.settlement.disputeCount ?? 0) },
    { header: "Deposit ID", value: (r) => r.deposit?.finixFundingTransferAttemptId || "" },
    { header: "Deposit Status", value: (r) => r.deposit?.state || "" },
    { header: "Trace ID", value: (r) => r.settlement.traceId || "" },
    { header: "Reconciliation Status", value: (r) => r.settlement.reconciliationStatus },
  ];
}

// Reconciliation notes/who-reconciled are internal admin context, not
// exposed to church_admin exports (masking, not just permission-gating the
// whole export — church_admin can still export everything else).
function adminOnlyColumns(): CsvColumn<SettlementExportRow>[] {
  return [
    { header: "Reconciled At", value: (r) => (r.settlement.reconciledAt ? r.settlement.reconciledAt.toISOString() : "") },
    { header: "Reconciled By", value: (r) => r.settlement.reconciledByEmail || "" },
    { header: "Reconciliation Notes", value: (r) => r.settlement.reconciliationNotes || "" },
  ];
}

export async function GET(req: Request) {
  const session = await getSession();
  const permissions = getSettlementPermissions(session?.role as "wgc_admin" | "church_admin" | undefined);

  if (!session || !session.churchId || !permissions.canExport) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || undefined;
  const depositStatusParam = searchParams.get("depositStatus") || undefined;
  const reconciliationStatus = searchParams.get("reconciliationStatus") || undefined;
  const traceId = searchParams.get("traceId") || undefined;
  const range = searchParams.get("range") || undefined;
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;
  const { from: startDate, to: endDate } = resolveDateRange(range, from, to);
  const dateFilter = startDate ? { gte: startDate, ...(endDate ? { lte: endDate } : {}) } : undefined;

  let linkedSettlementIds: string[] | null = null;
  if (depositStatusParam === "linked" || depositStatusParam === "unlinked") {
    const linked = await prisma.finixFundingTransferAttempt.findMany({
      where: { churchId: session.churchId, finixSettlementId: { not: null } },
      select: { finixSettlementId: true },
      distinct: ["finixSettlementId"],
    });
    linkedSettlementIds = linked.map((d) => d.finixSettlementId!).filter(Boolean);
  }

  const settlements = await prisma.finixSettlement.findMany({
    where: {
      churchId: session.churchId,
      ...(status ? { processorState: status } : {}),
      ...(reconciliationStatus ? { reconciliationStatus } : {}),
      ...(traceId ? { traceId } : {}),
      ...(dateFilter ? { createdAtFinix: dateFilter } : {}),
      ...(depositStatusParam === "linked" ? { finixSettlementId: { in: linkedSettlementIds ?? [] } } : {}),
      ...(depositStatusParam === "unlinked" ? { finixSettlementId: { notIn: linkedSettlementIds ?? [] } } : {}),
    },
    orderBy: { createdAtFinix: "desc" },
  });

  const settlementIds = settlements.map((s) => s.finixSettlementId);
  const deposits = settlementIds.length
    ? await prisma.finixFundingTransferAttempt.findMany({ where: { finixSettlementId: { in: settlementIds } } })
    : [];
  const depositBySettlement = new Map(deposits.map((d) => [d.finixSettlementId, d]));

  const rows: SettlementExportRow[] = settlements.map((settlement) => ({
    settlement,
    deposit: depositBySettlement.get(settlement.finixSettlementId),
  }));

  const columns = permissions.canManageReconciliation ? [...baseColumns(), ...adminOnlyColumns()] : baseColumns();

  await logDashboardAction({
    churchId: session.churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "settlement.export_performed",
    entityType: "settlement",
    metadata: { rowCount: rows.length },
    req,
  });

  const csv = buildCsvExport(rows, columns);
  return csvResponse(csv, "settlements.csv");
}
