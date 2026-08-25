/**
 * Core Donor Report query engine — powers the /reporting/donors page, the
 * "Donors" sheet of every export, and (via the same function) any saved
 * report of type DONORS. Composes the existing, already-correct donor
 * aggregate/scope libraries rather than re-deriving financial math:
 * - src/lib/auth/viewScope.ts + scopes.ts for tenant isolation & fundraiser scoping
 * - src/lib/donors/donorAggregates.ts for lifetime/period/refund/return totals
 * - src/lib/reporting/aggregations.ts for the payment-method gross split
 * - src/lib/dateRangePresets.ts for date-range resolution
 */
import { prisma } from "@/lib/prisma";
import type { MerchantAuthContext } from "@/lib/auth/requireMerchantSession";
import { resolveViewScope } from "@/lib/auth/viewScope";
import { resolveScopedDonorIds, resolveScopedUserId } from "@/lib/auth/scopes";
import { loadDonorAggregatesBatch, EMPTY_DONOR_AGGREGATES, type DonorAggregates } from "@/lib/donors/donorAggregates";
import { loadPaymentMethodBreakdownBatch, EMPTY_BREAKDOWN, loadSmallestDonationBatch } from "./aggregations";
import { resolveReportDateRange, toPrismaDateFilter, ytdRange, previousYearRange } from "./dateRange";
import { donorMatchesSegment, SEGMENTS_REQUIRING_BREAKDOWN } from "./segments";
import {
  MAX_AGGREGATED_DONORS,
  type ReportDefinition,
  type ReportResult,
  type DonorReportRow,
  type DonorReportColumn,
} from "./types";

const METHOD_SPLIT_COLUMNS: DonorReportColumn[] = ["cardGivingCents", "achGivingCents", "externalGivingCents", "cashGivingCents", "checkGivingCents", "inKindValueCents"];
const SMALLEST_DONATION_COLUMNS: DonorReportColumn[] = ["smallestDonationCents"];
const YTD_COLUMNS: DonorReportColumn[] = ["ytdGivingCents"];
const PREV_YEAR_COLUMNS: DonorReportColumn[] = ["previousYearGivingCents"];
const ATTRIBUTION_COLUMNS: DonorReportColumn[] = ["givingPage", "fund", "purpose"];

function needsAny(columns: DonorReportColumn[], of: DonorReportColumn[]): boolean {
  return columns.some((c) => of.includes(c));
}

function fromAggregates(a: DonorAggregates) {
  return {
    donationCount: a.donationCount,
    averageDonationCents: a.averageDonationCents,
    largestDonationCents: a.largestDonationCents,
    firstDonationDate: a.firstDonationAt,
    lastDonationDate: a.lastDonationAt,
    refundedAmountCents: a.refundedAmountCents,
    returnedAmountCents: a.returnedAmountCents,
    lifetimeGivingCents: a.netDonatedCents,
    periodGivingCents: a.netDonatedCents,
  };
}

export async function queryDonorReport(auth: MerchantAuthContext, def: ReportDefinition): Promise<ReportResult<DonorReportRow>> {
  const churchId = auth.churchId;
  const viewScope = await resolveViewScope(auth);
  const scopedDonorIds = await resolveScopedDonorIds(auth, viewScope);
  const scopedUserId = resolveScopedUserId(auth, viewScope);
  const effectiveAttributedUserId = def.filters.attributedUserId ?? scopedUserId ?? undefined;

  const periodRange = resolveReportDateRange(def.dateRange);
  const periodFilter = toPrismaDateFilter(periodRange);

  // --- Candidate donor set: non-financial filters only (search, scope, PII presence) ---
  const where: Record<string, unknown> = {
    churchId,
    archivedAt: null, // merged-away duplicates never appear as their own row (canonical-donor rule)
  };
  if (scopedDonorIds) where.id = { in: scopedDonorIds };
  if (def.filters.search?.trim()) {
    const q = def.filters.search.trim();
    where.OR = [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }];
  }
  if (def.filters.segment === "NO_EMAIL") where.email = null;

  const totalMatchingCount = await prisma.donor.count({ where: where as never });
  const candidateDonors = await prisma.donor.findMany({
    where: where as never,
    select: { id: true, name: true, email: true, phone: true, companyName: true, addressLine1: true, addressLine2: true, city: true, state: true, postalCode: true },
    orderBy: { createdAt: "asc" },
    take: MAX_AGGREGATED_DONORS,
  });
  const donorIds = candidateDonors.map((d) => d.id);
  const truncated = totalMatchingCount > MAX_AGGREGATED_DONORS;

  // --- Aggregates: always lifetime + selected period; YTD/prev-year/method-split only when needed ---
  const needsYtd = needsAny(def.columns, YTD_COLUMNS) || def.filters.segment === "MAJOR_DONOR";
  const needsPrevYear = needsAny(def.columns, PREV_YEAR_COLUMNS) || def.filters.segment === "INCREASED_GIVING" || def.filters.segment === "DECREASED_GIVING";
  const needsBreakdown = needsAny(def.columns, METHOD_SPLIT_COLUMNS) || (def.filters.segment ? SEGMENTS_REQUIRING_BREAKDOWN.includes(def.filters.segment) : false);
  const needsAttribution = needsAny(def.columns, ATTRIBUTION_COLUMNS);
  const needsSmallest = needsAny(def.columns, SMALLEST_DONATION_COLUMNS);

  const [lifetimeAgg, periodAgg, ytdAgg, prevYearAgg, breakdown, recurring, attribution, smallest] = await Promise.all([
    loadDonorAggregatesBatch(donorIds, churchId, undefined, effectiveAttributedUserId),
    loadDonorAggregatesBatch(donorIds, churchId, periodFilter, effectiveAttributedUserId),
    needsYtd ? loadDonorAggregatesBatch(donorIds, churchId, toPrismaDateFilter(ytdRange()), effectiveAttributedUserId) : Promise.resolve(new Map()),
    needsPrevYear ? loadDonorAggregatesBatch(donorIds, churchId, toPrismaDateFilter(previousYearRange()), effectiveAttributedUserId) : Promise.resolve(new Map()),
    needsBreakdown ? loadPaymentMethodBreakdownBatch(donorIds, churchId, periodFilter, effectiveAttributedUserId) : Promise.resolve(new Map()),
    loadRecurringSummaryBatch(donorIds, churchId),
    needsAttribution ? loadAttributionBatch(donorIds, churchId) : Promise.resolve(new Map()),
    needsSmallest ? loadSmallestDonationBatch(donorIds, churchId, periodFilter) : Promise.resolve(new Map()),
  ]);

  let rows: DonorReportRow[] = candidateDonors.map((d) => {
    const period = periodAgg.get(d.id) ?? EMPTY_DONOR_AGGREGATES;
    const lifetime = lifetimeAgg.get(d.id) ?? EMPTY_DONOR_AGGREGATES;
    const ytd = ytdAgg.get(d.id) ?? EMPTY_DONOR_AGGREGATES;
    const prevYear = prevYearAgg.get(d.id) ?? EMPTY_DONOR_AGGREGATES;
    const split = breakdown.get(d.id) ?? EMPTY_BREAKDOWN;
    const rec = recurring.get(d.id);
    const attr = attribution.get(d.id);
    const nameParts = (d.name || "").trim().split(/\s+/);

    return {
      donorId: d.id,
      donorName: d.name,
      firstName: nameParts[0] || null,
      lastName: nameParts.length > 1 ? nameParts.slice(1).join(" ") : null,
      email: d.email,
      phone: d.phone,
      companyName: d.companyName,
      address: d.addressLine1 ? `${d.addressLine1}${d.addressLine2 ? ", " + d.addressLine2 : ""}` : null,
      city: d.city,
      state: d.state,
      postalCode: d.postalCode,
      ...fromAggregatesForRow(period, lifetime),
      ytdGivingCents: ytd.netDonatedCents,
      previousYearGivingCents: prevYear.netDonatedCents,
      cardGivingCents: split.cardGivingCents,
      achGivingCents: split.achGivingCents,
      externalGivingCents: split.externalOtherGivingCents,
      cashGivingCents: split.cashGivingCents,
      checkGivingCents: split.checkGivingCents,
      inKindValueCents: split.inKindValueCents,
      smallestDonationCents: smallest.get(d.id) ?? 0,
      isRecurringDonor: Boolean(rec?.active),
      recurringAmountCents: rec?.amountCents ?? 0,
      givingFrequency: rec?.failed ? "FAILED" : rec?.frequency ?? null,
      givingPage: attr?.givingPage ?? null,
      fund: attr?.fund ?? null,
      purpose: attr?.purpose ?? null,
      attributedUserName: attr?.attributedUserName ?? null,
    };
  });

  // --- Filters that depend on computed aggregates ---
  if (def.filters.minAmountCents !== undefined) rows = rows.filter((r) => r.periodGivingCents >= def.filters.minAmountCents!);
  if (def.filters.maxAmountCents !== undefined) rows = rows.filter((r) => r.periodGivingCents <= def.filters.maxAmountCents!);
  if (def.filters.externalOnly) rows = rows.filter((r) => r.externalGivingCents + r.cashGivingCents + r.checkGivingCents > 0);
  if (def.filters.inKindOnly) rows = rows.filter((r) => r.inKindValueCents > 0);
  if (def.filters.refundedOnly) rows = rows.filter((r) => r.refundedAmountCents > 0);
  if (def.filters.achReturnedOnly) rows = rows.filter((r) => r.returnedAmountCents > 0);
  if (def.filters.segment) {
    const now = new Date();
    rows = rows.filter((r) => donorMatchesSegment(r, def.filters.segment!, def.filters.segmentParams, periodRange, now));
  }
  // Donors with zero activity in the report's context are excluded from
  // every report type except a plain "all donors" DONORS listing with no
  // date/segment/amount filter applied — otherwise every merchant with any
  // donor history would see a wall of $0 rows on every filtered view.
  const hasActiveFilter = Boolean(def.filters.segment || def.filters.minAmountCents !== undefined || def.dateRange.key !== "all");
  if (hasActiveFilter) rows = rows.filter((r) => r.periodGivingCents > 0 || r.donationCount > 0);

  rows = sortRows(rows, def.sortBy, def.sortDirection);

  const totalCount = rows.length;
  const start = (def.page - 1) * def.pageSize;
  const paged = rows.slice(start, start + def.pageSize);

  return { rows: paged, totalCount, page: def.page, pageSize: def.pageSize, truncated };
}

function fromAggregatesForRow(period: DonorAggregates, lifetime: DonorAggregates) {
  const base = fromAggregates(period);
  return { ...base, lifetimeGivingCents: lifetime.netDonatedCents, donationCount: period.donationCount || lifetime.donationCount };
}

interface RecurringSummary {
  active: boolean;
  failed: boolean;
  amountCents: number;
  frequency: string | null;
}

async function loadRecurringSummaryBatch(donorIds: string[], churchId: string): Promise<Map<string, RecurringSummary>> {
  const result = new Map<string, RecurringSummary>();
  if (donorIds.length === 0) return result;
  const subs = await prisma.finixSubscription.findMany({
    where: { churchId, donorId: { in: donorIds } },
    select: { donorId: true, amountCents: true, billingInterval: true, state: true, canceledAt: true, completedAt: true, failureCode: true },
  });
  for (const s of subs) {
    if (!s.donorId) continue;
    const isActive = !s.canceledAt && !s.completedAt && (s.state || "").toUpperCase() !== "CANCELED";
    const isFailed = (s.state || "").toUpperCase() === "FAILED" || Boolean(s.failureCode);
    const existing = result.get(s.donorId);
    if (isActive || !existing) {
      result.set(s.donorId, { active: isActive, failed: isFailed && !isActive, amountCents: s.amountCents ?? 0, frequency: s.billingInterval });
    }
  }
  return result;
}

interface AttributionSummary {
  givingPage: string | null;
  fund: string | null;
  purpose: string | null;
  attributedUserName: string | null;
}

/** Most-recent-transaction attribution — a donor who's given via multiple giving pages/funds shows whichever they used most recently. */
async function loadAttributionBatch(donorIds: string[], churchId: string): Promise<Map<string, AttributionSummary>> {
  const result = new Map<string, AttributionSummary>();
  if (donorIds.length === 0) return result;

  const payments = await prisma.payment.findMany({
    where: { churchId, donorId: { in: donorIds } },
    select: { donorId: true, fundName: true, attributedUserId: true, createdAt: true, givingLinkId: true },
    orderBy: { createdAt: "desc" },
  });
  const givingLinkIds = [...new Set(payments.map((p) => p.givingLinkId).filter((id): id is string => Boolean(id)))];
  const userIds = [...new Set(payments.map((p) => p.attributedUserId).filter((id): id is string => Boolean(id)))];
  const [links, users] = await Promise.all([
    givingLinkIds.length ? prisma.givingLink.findMany({ where: { id: { in: givingLinkIds } }, select: { id: true, publicTitle: true } }) : Promise.resolve([]),
    userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }) : Promise.resolve([]),
  ]);
  const linkTitle = new Map(links.map((l) => [l.id, l.publicTitle]));
  const userName = new Map(users.map((u) => [u.id, u.name || u.email]));

  for (const p of payments) {
    if (!p.donorId || result.has(p.donorId)) continue; // first row per donor = most recent (already ordered desc)
    result.set(p.donorId, {
      givingPage: p.givingLinkId ? linkTitle.get(p.givingLinkId) ?? null : null,
      fund: p.fundName ?? null,
      purpose: null,
      attributedUserName: p.attributedUserId ? userName.get(p.attributedUserId) ?? null : null,
    });
  }

  // Fill any donor with no Payment history from their most recent ExternalDonation instead.
  const missing = donorIds.filter((id) => !result.has(id));
  if (missing.length) {
    const externals = await prisma.externalDonation.findMany({
      where: { churchId, donorId: { in: missing } },
      select: { donorId: true, fundName: true, campaign: true, donationPurpose: true, givingPageLabel: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    for (const e of externals) {
      if (!e.donorId || result.has(e.donorId)) continue;
      result.set(e.donorId, { givingPage: e.givingPageLabel ?? null, fund: e.fundName ?? e.campaign ?? null, purpose: e.donationPurpose ?? null, attributedUserName: null });
    }
  }

  return result;
}

function sortRows(rows: DonorReportRow[], sortBy: ReportDefinition["sortBy"], direction: ReportDefinition["sortDirection"]): DonorReportRow[] {
  const mult = direction === "asc" ? 1 : -1;
  const sorted = [...rows].sort((a, b) => {
    switch (sortBy) {
      case "AMOUNT":
        return (a.periodGivingCents - b.periodGivingCents) * mult;
      case "DATE":
        return ((a.lastDonationDate?.getTime() ?? 0) - (b.lastDonationDate?.getTime() ?? 0)) * mult;
      case "DONOR_NAME":
        return (a.donorName || "").localeCompare(b.donorName || "") * mult;
      case "LIFETIME_GIVING":
        return (a.lifetimeGivingCents - b.lifetimeGivingCents) * mult;
      case "GIFT_COUNT":
        return (a.donationCount - b.donationCount) * mult;
      default:
        return 0;
    }
  });
  return sorted;
}
