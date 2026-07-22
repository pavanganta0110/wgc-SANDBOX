import { NextResponse } from "next/server";
import { formatCents } from "@/lib/format";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { resolveViewScope } from "@/lib/auth/viewScope";
import { resolveScopedDonorIds } from "@/lib/auth/scopes";
import { isAuthError } from "@/lib/auth/errors";
import { resolveDateRange } from "@/lib/dateRangePresets";
import { buildCsvExport, csvResponse, type CsvColumn } from "@/lib/csvExport";
import { loadDonorsList, type DonorsListFilters, type DonorListRow } from "@/lib/donors/donorsList";
import { DONOR_DISPLAY_STATUS_LABELS } from "@/lib/donors/donorStatus";
import { formatPersonName } from "@/lib/formatPersonName";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { prisma } from "@/lib/prisma";
import { loadDonorAggregates } from "@/lib/donors/donorAggregates";
import { loadDonorRiskSignals } from "@/lib/donors/donorRiskSignals";
import { resolveDonorDisplayStatus } from "@/lib/donors/donorStatus";

const COLUMNS: CsvColumn<DonorListRow>[] = [
  { header: "Donor ID", value: (r) => r.donor.id },
  { header: "Name", value: (r) => (r.donor.anonymousPreference ? "Anonymous Donor" : formatPersonName(r.donor.name)) },
  { header: "Email", value: (r) => r.donor.email || "" },
  { header: "Phone", value: (r) => r.donor.phone || "" },
  { header: "Status", value: (r) => DONOR_DISPLAY_STATUS_LABELS[r.status] },
  { header: "Total Donated", value: (r) => formatCents(r.aggregates.totalDonatedCents) },
  { header: "Net Donated", value: (r) => formatCents(r.aggregates.netDonatedCents) },
  { header: "Donation Count", value: (r) => String(r.aggregates.donationCount) },
  { header: "Average Donation", value: (r) => formatCents(r.aggregates.averageDonationCents) },
  { header: "Largest Donation", value: (r) => formatCents(r.aggregates.largestDonationCents) },
  { header: "First Donation", value: (r) => (r.aggregates.firstDonationAt ? r.aggregates.firstDonationAt.toISOString() : "") },
  { header: "Last Donation", value: (r) => (r.aggregates.lastDonationAt ? r.aggregates.lastDonationAt.toISOString() : "") },
  { header: "Recurring Status", value: (r) => (r.activeSubscriptionCount > 0 ? "Active" : "None") },
  { header: "Active Subscriptions", value: (r) => String(r.activeSubscriptionCount) },
  { header: "Failed Payments", value: (r) => String(r.aggregates.failedPaymentCount) },
  { header: "Refunded Amount", value: (r) => formatCents(r.aggregates.refundedAmountCents) },
  { header: "Returned Amount", value: (r) => formatCents(r.aggregates.returnedAmountCents) },
  { header: "Disputed Amount", value: (r) => formatCents(r.aggregates.disputedAmountCents) },
  { header: "Created", value: (r) => r.donor.createdAt.toISOString() },
  { header: "Updated", value: (r) => r.donor.updatedAt.toISOString() },
];

export async function GET(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getDonorPermissions(auth.rawRole);
  if (!permissions.canExport) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const viewScope = await resolveViewScope(auth);
  const scopedDonorIds = await resolveScopedDonorIds(auth, viewScope);

  const { searchParams } = new URL(req.url);
  const singleDonorId = searchParams.get("donorId");

  let rows: DonorListRow[];

  if (singleDonorId) {
    // Team-access Checkpoint 4A: a user-scoped export of a donor outside
    // their attributed set must 404 exactly like a nonexistent donor would.
    if (scopedDonorIds !== null && !scopedDonorIds.includes(singleDonorId)) {
      return NextResponse.json({ error: "Donor not found" }, { status: 404 });
    }
    const donor = await prisma.donor.findFirst({ where: { id: singleDonorId, churchId: auth.churchId } });
    if (!donor) return NextResponse.json({ error: "Donor not found" }, { status: 404 });
    const [aggregates, riskInput] = await Promise.all([
      loadDonorAggregates(donor.id, auth.churchId),
      loadDonorRiskSignals([donor.id], auth.churchId).then((m) => m.get(donor.id)!),
    ]);
    rows = [
      {
        donor,
        aggregates,
        status: resolveDonorDisplayStatus(riskInput),
        primaryInstrument: null,
        activeSubscriptionCount: aggregates.activeSubscriptionCount,
        givingLinkIds: [],
      },
    ];
  } else {
    const range = searchParams.get("range") || undefined;
    const from = searchParams.get("from") || undefined;
    const to = searchParams.get("to") || undefined;
    // Same rule as the dashboard page (donors/page.tsx): the donor roster
    // export is only date-bounded when the admin explicitly chose a
    // range — resolveDateRange's default preset must never silently
    // shrink "which donors exist" below the always-unbounded Total
    // Donors KPI, which is what previously caused the dashboard and CSV
    // donor counts to disagree.
    const explicitRangeRequested = Boolean(range || from || to);
    const createdDateFilter = explicitRangeRequested
      ? (() => {
          const { from: startDate, to: endDate } = resolveDateRange(range, from, to);
          return startDate ? { gte: startDate, ...(endDate ? { lte: endDate } : {}) } : undefined;
        })()
      : undefined;

    const filters: DonorsListFilters = {
      search: searchParams.get("q") || undefined,
      createdDateFilter,
      archivedStatus: (searchParams.get("archived") as DonorsListFilters["archivedStatus"]) || "active",
      donorIdIn: scopedDonorIds,
    };
    const result = await loadDonorsList(auth.churchId, filters, { key: "createdAt", dir: "desc" }, 1, 5000);
    rows = result.rows;
  }

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "donor.exported",
    entityType: "donor",
    metadata: { rowCount: rows.length, singleDonorId: singleDonorId || undefined },
    req,
  });

  const csv = buildCsvExport(rows, COLUMNS);
  return csvResponse(csv, "donors.csv");
}
