import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { canExportTeamMemberData } from "@/lib/settings/teamMemberAccess";
import { loadTeamMemberSummary } from "@/lib/settings/teamMemberDetail";
import { buildTransactionReportData, renderTransactionReportCsv, renderTransactionReportPdf } from "@/lib/exports/transactionReportData";
import { buildTransactionExportFilename, csvResponse } from "@/lib/exports/transactionExport";

/**
 * Scoped export for a single team member — never trusts a client-supplied
 * churchId, always re-derives it from the authenticated session and
 * verifies the target user belongs to that same church
 * (canExportTeamMemberData). This is the normal transaction export filtered
 * by Payment.attributedUserId — same canonical columns, calculations, and
 * serializer as every other transaction export (see transactionExport.ts);
 * it does not maintain its own CSV schema.
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

  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") === "pdf" ? "pdf" : "csv";

  const data = await buildTransactionReportData({
    churchId: auth.churchId,
    scope: summary.userId === auth.userId ? "MY_ACTIVITY" : "TEAM_MEMBER",
    owner: { name: summary.email, email: summary.email, userId: summary.userId, role: summary.role },
    generatedBy: { name: auth.email, email: auth.email },
    filter: { attributedUserId: summary.userId },
    appliedFiltersDescription: `Team Member = ${summary.email}`,
  });

  const filename = buildTransactionExportFilename("team-member", summary.email, format);

  if (format === "pdf") {
    const pdf = await renderTransactionReportPdf(data);
    return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"` } });
  }
  const csv = renderTransactionReportCsv(data);
  return csvResponse(csv, filename);
}
