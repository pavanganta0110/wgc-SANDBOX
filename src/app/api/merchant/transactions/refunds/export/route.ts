import { NextResponse } from "next/server";
import { resolveDateRange } from "@/lib/dateRangePresets";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { resolveViewScope } from "@/lib/auth/viewScope";
import { resolveScopedUserId } from "@/lib/auth/scopes";
import { isAuthError } from "@/lib/auth/errors";
import { buildTransactionReportData, renderTransactionReportCsv, renderTransactionReportPdf, resolveUserIdentity } from "@/lib/exports/transactionReportData";
import { buildTransactionExportFilename, csvResponse } from "@/lib/exports/transactionExport";

/**
 * Refund transaction export — the canonical transaction row set filtered
 * to payments that have a refund (Refund Status != NONE), same columns
 * and calculations as every other transaction export. A "refund export"
 * is conceptually the payments-with-refunds slice of the canonical
 * schema, not an independently-shaped refund-event row.
 */
export async function GET(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const viewScope = await resolveViewScope(auth);
  const scopedUserId = resolveScopedUserId(auth, viewScope) ?? undefined;

  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") === "pdf" ? "pdf" : "csv";
  const state = searchParams.get("state") || undefined;
  const range = searchParams.get("range") || undefined;
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;
  const donorFilter = searchParams.get("donor") || undefined;
  const last4 = searchParams.get("last4") || undefined;
  const { from: startDate, to: endDate } = resolveDateRange(range, from, to);
  const dateFilter = startDate ? { gte: startDate, ...(endDate ? { lte: endDate } : {}) } : undefined;

  let scope: "ENTIRE_ORGANIZATION" | "MY_ACTIVITY" | "TEAM_MEMBER" = "ENTIRE_ORGANIZATION";
  let owner = { name: "Entire Organization", email: "", userId: "", role: "" };
  if (scopedUserId) {
    const identity = await resolveUserIdentity(scopedUserId);
    scope = scopedUserId === auth.userId ? "MY_ACTIVITY" : "TEAM_MEMBER";
    owner = identity ? { name: identity.name, email: identity.email, userId: scopedUserId, role: identity.role } : { name: "", email: "", userId: scopedUserId, role: "" };
  }

  const data = await buildTransactionReportData({
    churchId: auth.churchId,
    scope,
    owner,
    generatedBy: { name: auth.email, email: auth.email },
    filter: { attributedUserId: scopedUserId, createdAtRange: dateFilter },
    appliedFiltersDescription: "Refund Status != NONE" + (state ? `, refundStatus=${state}` : ""),
  });

  const rows = data.rows.filter((r) => {
    if (r.refundStatus === "NONE") return false;
    if (state && r.refundStatus !== state) return false;
    if (last4 && r.lastFour !== last4) return false;
    if (donorFilter && !r.donorName.toLowerCase().includes(donorFilter.toLowerCase())) return false;
    return true;
  });
  const filteredData = { ...data, rows };

  const filenameBase = owner.email || "org-refunds";
  const filename = buildTransactionExportFilename("organization", `refunds-${filenameBase}`, format);

  if (format === "pdf") {
    const pdf = await renderTransactionReportPdf(filteredData);
    return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"` } });
  }
  const csv = renderTransactionReportCsv(filteredData);
  return csvResponse(csv, filename);
}
