import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveDateRange } from "@/lib/dateRangePresets";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { normalizeMerchantRole, ROLE_PERMISSIONS } from "@/lib/auth/roles";
import { buildTransactionReportData, renderTransactionReportCsv, renderTransactionReportPdf, resolveUserIdentity } from "@/lib/exports/transactionReportData";
import { buildTransactionExportFilename, csvResponse } from "@/lib/exports/transactionExport";

/**
 * Giving-link-scoped canonical transaction export. Row-scoping was
 * previously done via loadGivingLinkAttempts (which fetches every
 * Payment for the church/link, same source of truth) — now goes through
 * resolveTransactionExportRows's givingLinkId filter instead, so the CSV
 * uses the exact same canonical columns/calculations as every other
 * transaction export. Access stays organization-wide-only (per the
 * pre-existing policy: giving-link attempts have no per-user attribution
 * gate of their own — OWNER/ADMIN with export+all-transactions only).
 */
export async function GET(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const normalized = normalizeMerchantRole(auth.rawRole);
  const base = normalized ? ROLE_PERMISSIONS[normalized] : null;
  if (!base?.canExportReports || !base.canViewAllTransactions) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") === "pdf" ? "pdf" : "csv";
  const givingLinkId = searchParams.get("givingLinkId") || undefined;
  const range = searchParams.get("range") || undefined;
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;
  const { from: startDate, to: endDate } = resolveDateRange(range, from, to);
  const dateFilter = startDate ? { gte: startDate, ...(endDate ? { lte: endDate } : {}) } : undefined;

  let owner = { name: "Entire Organization", email: "", userId: "", role: "" };
  let filenameId = "all-links";
  if (givingLinkId) {
    const link = await prisma.givingLink.findFirst({ where: { id: givingLinkId, churchId: auth.churchId }, select: { internalName: true, publicTitle: true, ownerUserId: true } });
    if (!link) return NextResponse.json({ error: "Giving link not found" }, { status: 404 });
    filenameId = link.internalName || link.publicTitle || givingLinkId;
    const ownerIdentity = link.ownerUserId ? await resolveUserIdentity(link.ownerUserId) : null;
    owner = { name: link.internalName || link.publicTitle || "", email: ownerIdentity?.email || "", userId: link.ownerUserId || "", role: ownerIdentity?.role || "" };
  }

  const data = await buildTransactionReportData({
    churchId: auth.churchId,
    scope: "GIVING_LINK",
    owner,
    generatedBy: { name: auth.email, email: auth.email },
    filter: { givingLinkId, createdAtRange: dateFilter },
    appliedFiltersDescription: givingLinkId ? `Giving Link = ${filenameId}` : "All Giving Links",
  });

  const filename = buildTransactionExportFilename("giving-link", filenameId, format);

  if (format === "pdf") {
    const pdf = await renderTransactionReportPdf(data);
    return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"` } });
  }
  const csv = renderTransactionReportCsv(data);
  return csvResponse(csv, filename);
}
