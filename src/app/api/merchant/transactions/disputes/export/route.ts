import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { formatCents } from "@/lib/format";
import { resolveDateRange } from "@/lib/dateRangePresets";
import { buildCsvExport, csvResponse, type CsvColumn } from "@/lib/csvExport";
import { loadDisputesList, type DisputeListRow } from "@/lib/finix/disputesList";
import { resolveDisputeDisplayStatus, DISPUTE_DISPLAY_STATUS_LABELS } from "@/lib/finix/disputeStatus";
import { formatPersonName } from "@/lib/formatPersonName";
import { getDisputePermissions } from "@/lib/finix/disputePermissions";

const COLUMNS: CsvColumn<DisputeListRow>[] = [
  { header: "ID", value: (r) => r.dispute.finixDisputeId },
  { header: "Created", value: (r) => (r.dispute.createdAtFinix ? r.dispute.createdAtFinix.toISOString() : "") },
  { header: "Updated", value: (r) => (r.dispute.updatedAtFinix ? r.dispute.updatedAtFinix.toISOString() : "") },
  { header: "Donor", value: (r) => formatPersonName(r.donor?.name, r.instrument?.accountHolderName) },
  { header: "Payment ID", value: (r) => r.dispute.finixTransferId || "" },
  { header: "Payment Amount", value: (r) => formatCents(r.transfer?.amountCents ?? 0) },
  { header: "Disputed Amount", value: (r) => formatCents(r.dispute.amountCents ?? 0) },
  { header: "Reason", value: (r) => r.dispute.reason || "" },
  { header: "Status", value: (r) => DISPUTE_DISPLAY_STATUS_LABELS[resolveDisputeDisplayStatus(r.dispute)] },
  { header: "Response Status", value: (r) => (r.dispute.respondedAt ? "Submitted" : "Not Submitted") },
  { header: "Evidence Due", value: (r) => (r.dispute.evidenceDueAt ? r.dispute.evidenceDueAt.toISOString() : "") },
  { header: "Payment Method", value: (r) => r.instrument?.cardBrand || (r.instrument?.bankLast4 ? "Bank Account" : "") },
  { header: "Last Four", value: (r) => r.instrument?.cardLast4 || r.instrument?.bankLast4 || "" },
  { header: "Settlement ID", value: (r) => r.settlement?.finixSettlementId || "" },
  { header: "Deposit ID", value: (r) => r.deposit?.finixFundingTransferAttemptId || "" },
];

export async function GET(req: Request) {
  const session = await getSession();

  const permissions = getDisputePermissions(session?.role);
  if (!session || !session.churchId || !permissions.canExport) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const range = searchParams.get("range") || undefined;
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;
  const { from: startDate, to: endDate } = resolveDateRange(range, from, to);
  const dateFilter = startDate ? { gte: startDate, ...(endDate ? { lte: endDate } : {}) } : undefined;

  const rows = await loadDisputesList(session.churchId, dateFilter);

  const csv = buildCsvExport(rows, COLUMNS);
  return csvResponse(csv, "disputes.csv");
}
