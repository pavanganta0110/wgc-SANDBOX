import { NextResponse } from "next/server";
import { resolveDateRange } from "@/lib/dateRangePresets";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { resolveViewScope } from "@/lib/auth/viewScope";
import { resolveScopedUserId } from "@/lib/auth/scopes";
import { isAuthError } from "@/lib/auth/errors";
import { buildTransactionReportData, renderTransactionReportCsv, renderTransactionReportPdf, resolveUserIdentity, type ReportScope } from "@/lib/exports/transactionReportData";
import { buildTransactionExportFilename, csvResponse } from "@/lib/exports/transactionExport";

/**
 * Organization-scoped canonical transaction export — the same shared
 * report-data builder as the team-member/giving-link exports (see
 * transactionReportData.ts). Respects the existing dashboard view-scope
 * dropdown: an OWNER/ADMIN "viewing as" a team member gets that member's
 * scoped report, matching what they see on screen (buildFinixTransferScope's
 * old behavior, now expressed as an attributedUserId filter instead).
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
  const last4 = searchParams.get("last4") || undefined;
  const buyer = searchParams.get("buyer") || undefined;
  const range = searchParams.get("range") || undefined;
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;
  const { from: startDate, to: endDate } = resolveDateRange(range, from, to);
  const dateFilter = startDate ? { gte: startDate, ...(endDate ? { lte: endDate } : {}) } : undefined;

  let scope: ReportScope = "ENTIRE_ORGANIZATION";
  let owner = { name: "Entire Organization", email: "", userId: "", role: "" };
  if (scopedUserId) {
    const identity = await resolveUserIdentity(scopedUserId);
    scope = scopedUserId === auth.userId ? "MY_ACTIVITY" : "TEAM_MEMBER";
    owner = identity
      ? { name: identity.name, email: identity.email, userId: scopedUserId, role: identity.role }
      : { name: "", email: "", userId: scopedUserId, role: "" };
  }

  const appliedFilters = [
    state ? `state=${state}` : null,
    last4 ? `last4=${last4}` : null,
    buyer ? `buyer=${buyer}` : null,
    range ? `range=${range}` : null,
  ]
    .filter(Boolean)
    .join(", ") || "None";

  const data = await buildTransactionReportData({
    churchId: auth.churchId,
    scope,
    owner,
    generatedBy: { name: auth.email, email: auth.email },
    filter: { attributedUserId: scopedUserId, createdAtRange: dateFilter },
    appliedFiltersDescription: appliedFilters,
  });

  // last4/buyer/state are UI list filters specific to this page — applied
  // as a post-filter on the canonical rows rather than widening the shared
  // module's filter surface with route-specific query params.
  const REFUND_DERIVED_STATES = new Set(["REFUNDED", "PARTIALLY_REFUNDED", "REFUND_PENDING", "PENDING"]);
  const rows = data.rows.filter((r) => {
    if (last4 && r.lastFour !== last4) return false;
    if (buyer && !r.donorName.toLowerCase().includes(buyer.toLowerCase())) return false;
    if (state) {
      const isRefundDerived = REFUND_DERIVED_STATES.has(state) && state !== "PENDING";
      if (isRefundDerived && r.refundStatus !== state) return false;
      if (!isRefundDerived && r.transactionStatus !== state) return false;
    }
    return true;
  });
  const filteredData = { ...data, rows };

  const filenameBase = scope === "ENTIRE_ORGANIZATION" ? "org" : owner.email || scopedUserId || "org";
  const filename = buildTransactionExportFilename("organization", filenameBase, format);

  if (format === "pdf") {
    const pdf = await renderTransactionReportPdf(filteredData);
    return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"` } });
  }
  const csv = renderTransactionReportCsv(filteredData);
  return csvResponse(csv, filename);
}
