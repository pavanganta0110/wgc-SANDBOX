import { NextResponse } from "next/server";
import { formatCents } from "@/lib/format";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { canExportTeamMemberData } from "@/lib/settings/teamMemberAccess";
import { loadTeamMemberSummary, loadTeamMemberTransactions } from "@/lib/settings/teamMemberDetail";
import { buildCsvExport, csvResponse, type CsvColumn } from "@/lib/csvExport";

interface ExportRow {
  memberEmail: string;
  givingLinkName: string;
  paymentId: string;
  finixTransferId: string;
  createdAt: Date;
  donorName: string;
  paymentMethodType: string;
  amountCents: number;
  refundedCents: number;
  netCents: number;
  status: string;
}

const COLUMNS: CsvColumn<ExportRow>[] = [
  { header: "Member Email", value: (r) => r.memberEmail },
  { header: "Giving Link", value: (r) => r.givingLinkName },
  { header: "Transaction ID", value: (r) => r.paymentId },
  { header: "Finix Transfer ID", value: (r) => r.finixTransferId },
  { header: "Donation Date", value: (r) => r.createdAt.toISOString() },
  { header: "Donor Name", value: (r) => r.donorName },
  { header: "Payment Method", value: (r) => r.paymentMethodType },
  { header: "Gross Amount", value: (r) => formatCents(r.amountCents) },
  { header: "Refund Amount", value: (r) => formatCents(r.refundedCents) },
  { header: "Net Amount", value: (r) => formatCents(r.netCents) },
  { header: "Status", value: (r) => r.status },
];

/**
 * Scoped export for a single team member — never trusts a client-supplied
 * churchId, always re-derives it from the authenticated session and
 * verifies the target user belongs to that same church (canExportTeamMemberData).
 * Deliberately excludes card/bank numbers, tokens, and any raw Finix
 * credential — only the same non-sensitive fields already shown on the
 * Transactions tab, keyed off Payment.attributedUserId.
 */
export async function GET(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const { userId } = await params;
  const summary = await loadTeamMemberSummary(auth.churchId, userId);
  if (!summary) return NextResponse.json({ error: "Team member not found" }, { status: 404 });
  if (!canExportTeamMemberData(auth, { id: summary.userId, churchId: auth.churchId })) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const transactions = await loadTeamMemberTransactions(auth.churchId, summary.userId);
  const rows: ExportRow[] = transactions.map((t) => ({
    memberEmail: summary.email,
    givingLinkName: t.givingLinkName || "",
    paymentId: t.paymentId,
    finixTransferId: t.finixTransferId || "",
    createdAt: t.createdAt,
    donorName: t.donorName,
    paymentMethodType: t.paymentMethodType,
    amountCents: t.amountCents,
    refundedCents: t.refundedCents,
    netCents: t.netCents,
    status: t.status,
  }));

  const csv = buildCsvExport(rows, COLUMNS);
  return csvResponse(csv, `team-member-${summary.email.replace(/[^a-z0-9.@-]/gi, "_")}.csv`);
}
