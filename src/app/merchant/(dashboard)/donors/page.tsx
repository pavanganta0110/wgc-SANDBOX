import Link from "next/link";
import { ArrowUpDown, Users, AlertTriangle } from "lucide-react";
import { redirect } from "next/navigation";
import { formatCents } from "@/lib/format";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { resolveViewScope } from "@/lib/auth/viewScope";
import { resolveScopedDonorIds } from "@/lib/auth/scopes";
import { isAuthError } from "@/lib/auth/errors";
import { resolveDateRange } from "@/lib/dateRangePresets";
import CopyableIdBadge from "@/components/merchant/CopyableIdBadge";
import ClickableTableRow from "@/components/merchant/ClickableTableRow";
import StateBadge from "@/components/merchant/StateBadge";
import DonorDetailPanel from "@/components/merchant/DonorDetailPanel";
import DonorsFilterBar from "@/components/merchant/DonorsFilterBar";
import DonorRowActions from "@/components/merchant/DonorRowActions";
import AddDonorButton from "@/components/merchant/AddDonorButton";
import ImportDonorsButton from "@/components/merchant/ImportDonorsButton";
import Pagination from "@/components/merchant/Pagination";
import DonationTrendChart from "@/components/merchant/DonationTrendChart";
import DonorGrowthChart from "@/components/merchant/DonorGrowthChart";
import TopDonorsCard from "@/components/merchant/TopDonorsCard";
import { formatDateCDT, formatTimeCDT } from "@/lib/formatDateTimeCDT";
import { formatPersonName } from "@/lib/formatPersonName";
import { loadDonorsList, type DonorsListSort } from "@/lib/donors/donorsList";
import { loadDonorSummary } from "@/lib/donors/donorSummary";
import { loadDonationTrend, loadTopDonors, type TopDonorMetric } from "@/lib/donors/donorAnalytics";
import { loadDonorAnalyticsExtended, loadDonorGrowth } from "@/lib/donors/donorAnalyticsExtended";
import { loadDonorPaymentMethodMix } from "@/lib/donors/donorBreakdowns";
import { prisma } from "@/lib/prisma";
import DonorAnalyticsExtras from "@/components/merchant/DonorAnalyticsExtras";
import { parseVisibleDonorColumns } from "@/lib/donorColumns";
import { DONOR_DISPLAY_STATUS_LABELS, type DonorDisplayStatus } from "@/lib/donors/donorStatus";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { PinButton } from "@/components/merchant/PaymentDetailActions";

const PAGE_SIZE = 25;

function StackedDateTime({ date }: { date: Date | null | undefined }) {
  if (!date) return <span className="text-slate-400">—</span>;
  return (
    <div className="whitespace-nowrap">
      <p className="text-slate-700">{formatDateCDT(date)}</p>
      <p className="text-xs text-slate-400">{formatTimeCDT(date)} CDT</p>
    </div>
  );
}

function SummaryCard({ label, value, sublabel }: { label: string; value: string; sublabel?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-xl font-bold text-slate-900">{value}</p>
      {sublabel && <p className="text-xs text-slate-400 mt-0.5">{sublabel}</p>}
    </div>
  );
}

export default async function DonorsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    recurring?: string;
    paymentMethod?: string;
    minTotal?: string;
    maxTotal?: string;
    hasFailedPayment?: string;
    hasRefund?: string;
    hasBankReturn?: string;
    hasDispute?: string;
    hasActiveSubscription?: string;
    archived?: string;
    range?: string;
    from?: string;
    to?: string;
    cols?: string;
    sort?: string;
    page?: string;
    topMetric?: string;
    id?: string;
  }>;
}) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/dashboard");
    throw err;
  }
  const churchId = auth.churchId;
  const permissions = getDonorPermissions(auth.rawRole);
  const sp = await searchParams;

  // Team-access: donor list and every summary/trend/growth analytics card
  // are scoped to donors with attributed activity for the selected user
  // (resolveScopedDonorIds, same helper used by the donor-export and
  // donor-detail routes).
  const viewScope = await resolveViewScope(auth);
  const scopedDonorIds = (await resolveScopedDonorIds(auth, viewScope)) ?? undefined;

  const { from: startDate, to: endDate } = resolveDateRange(sp.range, sp.from, sp.to);
  const dateFilter = startDate ? { gte: startDate, ...(endDate ? { lte: endDate } : {}) } : undefined;
  const visibleCols = parseVisibleDonorColumns(sp.cols);

  const minTotal = sp.minTotal ? Math.round(parseFloat(sp.minTotal) * 100) : undefined;
  const maxTotal = sp.maxTotal ? Math.round(parseFloat(sp.maxTotal) * 100) : undefined;

  const [sortKey, sortDir] = (sp.sort || "createdAt:desc").split(":") as [DonorsListSort["key"], "asc" | "desc"];
  const page = Math.max(1, parseInt(sp.page || "1", 10) || 1);
  const topMetric: TopDonorMetric = (["gross", "net", "count", "recurring"].includes(sp.topMetric || "") ? sp.topMetric : "net") as TopDonorMetric;

  // Sequenced, not Promise.all-ed — each of these loaders already fans out
  // into several of its own batched queries, and running all four top-level
  // loaders concurrently was enough to exhaust Supabase's pooled-connection
  // limit (session-mode pool_size: 15) on a single page load, confirmed by
  // a real 500 against the live pooler. Trading a bit of latency for not
  // blowing the connection budget.
  const summary = await loadDonorSummary(churchId, dateFilter, scopedDonorIds);
  const trend = await loadDonationTrend(churchId, dateFilter, "weekly", scopedDonorIds);
  const topDonors = await loadTopDonors(churchId, dateFilter, topMetric, 10, scopedDonorIds);

  let previousPeriodFilter: { gte: Date; lte?: Date } | undefined;
  if (dateFilter?.lte) {
    const spanMs = dateFilter.lte.getTime() - dateFilter.gte.getTime();
    previousPeriodFilter = { gte: new Date(dateFilter.gte.getTime() - spanMs), lte: new Date(dateFilter.gte.getTime() - 1) };
  }
  const extended = await loadDonorAnalyticsExtended(churchId, dateFilter, previousPeriodFilter, scopedDonorIds);
  const growth = await loadDonorGrowth(churchId, dateFilter, "weekly", scopedDonorIds);
  const orgInstruments = await prisma.finixPaymentInstrumentSnapshot.findMany({
    where: { churchId, donorId: scopedDonorIds ? { in: scopedDonorIds } : { not: null } },
    select: { finixPaymentInstrumentId: true },
  });
  const paymentMethodMix = await loadDonorPaymentMethodMix(
    orgInstruments.map((i) => i.finixPaymentInstrumentId),
    churchId,
  );

  const { rows, totalCount } = await loadDonorsList(
    churchId,
    {
      search: sp.q,
      createdDateFilter: dateFilter,
      donorStatus: sp.status && sp.status in DONOR_DISPLAY_STATUS_LABELS ? (sp.status as DonorDisplayStatus) : undefined,
      recurringOnly: sp.recurring === "1",
      paymentMethod: sp.paymentMethod === "card" || sp.paymentMethod === "bank" ? sp.paymentMethod : undefined,
      minTotalDonatedCents: Number.isNaN(minTotal) ? undefined : minTotal,
      maxTotalDonatedCents: Number.isNaN(maxTotal) ? undefined : maxTotal,
      hasFailedPayment: sp.hasFailedPayment === "1",
      hasRefund: sp.hasRefund === "1",
      hasBankReturn: sp.hasBankReturn === "1",
      hasDispute: sp.hasDispute === "1",
      hasActiveSubscription: sp.hasActiveSubscription === "1",
      archivedStatus: (sp.archived as "active" | "archived" | "all") || "active",
      donorIdIn: scopedDonorIds,
    },
    { key: sortKey, dir: sortDir },
    page,
    PAGE_SIZE,
  );

  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const sortLink = (key: string) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v && k !== "sort" && k !== "page") params.set(k, v);
    const nextDir = sortKey === key && sortDir === "desc" ? "asc" : "desc";
    params.set("sort", `${key}:${nextDir}`);
    return `?${params.toString()}`;
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <h2 className="text-lg font-bold text-slate-900">Donors</h2>
        <PinButton />
        <Link href="/merchant/donors/annual-statements" className="text-sm font-semibold text-blue-600 hover:underline">
          Annual Donation Statements
        </Link>
        {permissions.canEdit && (
          <div className="ml-auto flex items-center gap-2">
            <ImportDonorsButton />
            <AddDonorButton />
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <SummaryCard label="Total Donors" value={String(summary.totalDonors)} />
        <SummaryCard label="Active Donors" value={String(summary.activeDonors)} sublabel="Selected period" />
        <SummaryCard label="New Donors" value={String(summary.newDonors)} sublabel="Selected period" />
        <SummaryCard label="Recurring Donors" value={String(summary.recurringDonors)} />
        <SummaryCard label="Total Donated" value={formatCents(summary.totalDonatedCents)} sublabel="Selected period" />
        <SummaryCard label="Average Donation" value={formatCents(summary.averageDonationCents)} sublabel="Selected period" />
        <SummaryCard label="Donors With Failed Payments" value={String(summary.donorsWithFailedPayments)} />
        <SummaryCard label="Donors Requiring Attention" value={String(summary.donorsRequiringAttention)} />
      </div>

      {/* Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <DonationTrendChart data={trend} />
        </div>
        <TopDonorsCard rows={topDonors.rows} metric={topMetric} />
      </div>

      <div className="grid grid-cols-1 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <DonorGrowthChart data={growth} />
        </div>
      </div>

      <DonorAnalyticsExtras extended={extended} paymentMethodMix={paymentMethodMix} />

      <div className="flex justify-end mb-6">
        <a
          href={`/api/merchant/donors/analytics/export?${new URLSearchParams({ ...(sp.range ? { range: sp.range } : {}), ...(sp.from ? { from: sp.from } : {}), ...(sp.to ? { to: sp.to } : {}) }).toString()}`}
          className="text-sm font-semibold text-blue-600 hover:underline"
        >
          Export Analytics Summary (CSV)
        </a>
      </div>

      <DonorsFilterBar exportHref="/api/merchant/donors/export" />

      <div className="flex items-start gap-6">
        <div className="flex-1 min-w-0 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
          {rows.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-slate-50 flex items-center justify-center mb-3">
                <Users className="w-6 h-6 text-slate-300" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 mb-1">No donors yet</h3>
              <p className="text-sm text-slate-500 max-w-sm mx-auto">
                Donors will appear here after they make a donation or are added by an authorized organization user.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm min-w-[1600px]">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50">
                  {visibleCols.has("donor") && (
                    <th className="px-6 py-3">
                      <Link href={sortLink("name")} className="flex items-center gap-1 hover:text-slate-800">
                        Donor <ArrowUpDown className="w-3 h-3" />
                      </Link>
                    </th>
                  )}
                  {visibleCols.has("contact") && <th className="px-6 py-3">Contact</th>}
                  {visibleCols.has("status") && <th className="px-6 py-3">Status</th>}
                  {visibleCols.has("totalDonated") && (
                    <th className="px-6 py-3 text-right">
                      <Link href={sortLink("totalDonatedCents")} className="flex items-center justify-end gap-1 hover:text-slate-800">
                        Total Donated <ArrowUpDown className="w-3 h-3" />
                      </Link>
                    </th>
                  )}
                  {visibleCols.has("donationCount") && (
                    <th className="px-6 py-3 text-right">
                      <Link href={sortLink("donationCount")} className="flex items-center justify-end gap-1 hover:text-slate-800">
                        Donation Count <ArrowUpDown className="w-3 h-3" />
                      </Link>
                    </th>
                  )}
                  {visibleCols.has("averageDonation") && <th className="px-6 py-3 text-right">Average Donation</th>}
                  {visibleCols.has("firstDonation") && (
                    <th className="px-6 py-3">
                      <Link href={sortLink("firstDonationAt")} className="flex items-center gap-1 hover:text-slate-800">
                        First Donation <ArrowUpDown className="w-3 h-3" />
                      </Link>
                    </th>
                  )}
                  {visibleCols.has("lastDonation") && (
                    <th className="px-6 py-3">
                      <Link href={sortLink("lastDonationAt")} className="flex items-center gap-1 hover:text-slate-800">
                        Last Donation <ArrowUpDown className="w-3 h-3" />
                      </Link>
                    </th>
                  )}
                  {visibleCols.has("recurringStatus") && <th className="px-6 py-3">Recurring Status</th>}
                  {visibleCols.has("paymentMethods") && <th className="px-6 py-3">Payment Methods</th>}
                  {visibleCols.has("failedPayments") && <th className="px-6 py-3 text-right">Failed Payments</th>}
                  {visibleCols.has("refunds") && <th className="px-6 py-3 text-right">Refunds</th>}
                  {visibleCols.has("bankReturns") && <th className="px-6 py-3 text-right">Bank Returns</th>}
                  {visibleCols.has("disputes") && <th className="px-6 py-3 text-right">Disputes</th>}
                  {visibleCols.has("created") && (
                    <th className="px-6 py-3">
                      <Link href={sortLink("createdAt")} className="flex items-center gap-1 hover:text-slate-800">
                        Created <ArrowUpDown className="w-3 h-3" />
                      </Link>
                    </th>
                  )}
                  <th className="px-6 py-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ donor, aggregates, status, primaryInstrument, activeSubscriptionCount }) => {
                  const isSelected = sp.id === donor.id;
                  const isArchived = Boolean(donor.archivedAt);
                  return (
                    <ClickableTableRow
                      key={donor.id}
                      id={donor.id}
                      className={`border-t border-slate-50 hover:bg-slate-50 ${isSelected ? "bg-slate-50" : ""}`}
                    >
                      {visibleCols.has("donor") && (
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center shrink-0">
                              {(donor.anonymousPreference ? "A" : formatPersonName(donor.name)[0]) || "?"}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-800">
                                {donor.anonymousPreference ? "Anonymous Donor" : formatPersonName(donor.name)}
                              </p>
                              {donor.companyName && <p className="text-xs text-slate-400">{donor.companyName}</p>}
                              {isArchived && <span className="text-xs text-slate-400">Archived</span>}
                            </div>
                          </div>
                        </td>
                      )}
                      {visibleCols.has("contact") && (
                        <td className="px-6 py-3 text-slate-600">
                          <p>{donor.email || "—"}</p>
                          <p className="text-xs text-slate-400">{donor.phone || "—"}</p>
                          {!donor.email && !donor.phone && (
                            <p className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
                              <AlertTriangle className="w-3 h-3" /> Missing contact
                            </p>
                          )}
                        </td>
                      )}
                      {visibleCols.has("status") && (
                        <td className="px-6 py-3">
                          <StateBadge state={status} />
                        </td>
                      )}
                      {visibleCols.has("totalDonated") && (
                        <td className="px-6 py-3 text-right font-semibold text-slate-900">{formatCents(aggregates.totalDonatedCents)}</td>
                      )}
                      {visibleCols.has("donationCount") && (
                        <td className="px-6 py-3 text-right text-slate-600">{aggregates.donationCount}</td>
                      )}
                      {visibleCols.has("averageDonation") && (
                        <td className="px-6 py-3 text-right text-slate-600">{formatCents(aggregates.averageDonationCents)}</td>
                      )}
                      {visibleCols.has("firstDonation") && (
                        <td className="px-6 py-3"><StackedDateTime date={aggregates.firstDonationAt} /></td>
                      )}
                      {visibleCols.has("lastDonation") && (
                        <td className="px-6 py-3"><StackedDateTime date={aggregates.lastDonationAt} /></td>
                      )}
                      {visibleCols.has("recurringStatus") && (
                        <td className="px-6 py-3 text-slate-600">
                          {activeSubscriptionCount > 0 ? `Active (${activeSubscriptionCount})` : "None"}
                        </td>
                      )}
                      {visibleCols.has("paymentMethods") && (
                        <td className="px-6 py-3 text-slate-600">
                          {primaryInstrument
                            ? `${primaryInstrument.cardBrand || (primaryInstrument.bankLast4 ? "Bank" : "—")} •••• ${
                                primaryInstrument.cardLast4 || primaryInstrument.bankLast4 || ""
                              }`
                            : "—"}
                        </td>
                      )}
                      {visibleCols.has("failedPayments") && (
                        <td className={`px-6 py-3 text-right ${aggregates.failedPaymentCount > 0 ? "text-red-600 font-semibold" : "text-slate-600"}`}>
                          {aggregates.failedPaymentCount}
                        </td>
                      )}
                      {visibleCols.has("refunds") && (
                        <td className="px-6 py-3 text-right text-slate-600">
                          {aggregates.refundCount > 0 ? `${aggregates.refundCount} · ${formatCents(aggregates.refundedAmountCents)}` : "—"}
                        </td>
                      )}
                      {visibleCols.has("bankReturns") && (
                        <td className="px-6 py-3 text-right text-slate-600">
                          {aggregates.bankReturnCount > 0 ? `${aggregates.bankReturnCount} · ${formatCents(aggregates.returnedAmountCents)}` : "—"}
                        </td>
                      )}
                      {visibleCols.has("disputes") && (
                        <td className="px-6 py-3 text-right text-slate-600">
                          {aggregates.disputeCount > 0 ? `${aggregates.disputeCount} · ${formatCents(aggregates.disputedAmountCents)}` : "—"}
                        </td>
                      )}
                      {visibleCols.has("created") && (
                        <td className="px-6 py-3"><StackedDateTime date={donor.createdAt} /></td>
                      )}
                      <td className="px-6 py-3">
                        <DonorRowActions
                          donorId={donor.id}
                          isArchived={isArchived}
                          canArchive={permissions.canArchive}
                          canRestore={permissions.canRestore}
                          canExport={permissions.canExport}
                          canEdit={permissions.canEdit}
                        />
                      </td>
                    </ClickableTableRow>
                  );
                })}
              </tbody>
            </table>
          )}
          {rows.length > 0 && <Pagination page={page} pageCount={pageCount} total={totalCount} pageSize={PAGE_SIZE} />}
        </div>
        {sp.id && <DonorDetailPanel donorId={sp.id} churchId={churchId} canAddNote={permissions.canAddNote} />}
      </div>
    </div>
  );
}
