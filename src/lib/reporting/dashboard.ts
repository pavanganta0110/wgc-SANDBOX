/**
 * Main Reporting dashboard KPI tiles — composes the existing donor
 * analytics library rather than recomputing donor counts/retention a
 * second, potentially-divergent way (item 38: Donors/Insights/Reporting/
 * Annual Statements must share one source of truth for these numbers).
 *
 * Definitions (all for the selected period; see reportingPeriod.ts):
 *  - New donor: first-ever gift falls inside the period.
 *  - Returning donor: gave in the period, first-ever gift was before it.
 *  - Retention: share of the previous year's donors who gave again in the period (null with no prior-year giving).
 *  - Lapsed: gave in the previous year, has not given in the period.
 */
import { prisma } from "@/lib/prisma";
import type { MerchantAuthContext } from "@/lib/auth/requireMerchantSession";
import { resolveViewScope } from "@/lib/auth/viewScope";
import { resolveScopedDonorIds } from "@/lib/auth/scopes";
import { loadDonorAnalyticsExtended } from "@/lib/donors/donorAnalyticsExtended";
import { loadDonorAggregatesBatch } from "@/lib/donors/donorAggregates";
import {
  computeRetention,
  resolveReportingPeriod,
  type ReportingPeriod,
} from "./reportingPeriod";
import type { ReportKpis } from "./types";

const DONOR_CAP = 5000;

export async function loadReportingKpis(
  auth: MerchantAuthContext,
  period: ReportingPeriod = resolveReportingPeriod(new Date().getFullYear()),
): Promise<ReportKpis> {
  const churchId = auth.churchId;
  const viewScope = await resolveViewScope(auth);
  const scopedDonorIds = await resolveScopedDonorIds(auth, viewScope);

  // Donor-count metrics compare against the full previous year (the retention base);
  // money deltas compare against the same span a year earlier (period.comparison).
  const analytics = await loadDonorAnalyticsExtended(
    churchId,
    period.range,
    period.previousYear,
    scopedDonorIds ?? undefined,
  );

  const donorWhere = {
    churchId,
    archivedAt: null,
    ...(scopedDonorIds ? { id: { in: scopedDonorIds } } : {}),
  };
  const totalDonors = await prisma.donor.count({ where: donorWhere });

  const donorIds = (
    await prisma.donor.findMany({
      where: donorWhere,
      select: { id: true },
      take: DONOR_CAP,
    })
  ).map((d) => d.id);

  const [periodAgg, previousYearAgg, comparisonAgg, lifetimeAgg] =
    await Promise.all([
      loadDonorAggregatesBatch(donorIds, churchId, period.range),
      loadDonorAggregatesBatch(donorIds, churchId, period.previousYear),
      loadDonorAggregatesBatch(donorIds, churchId, period.comparison),
      loadDonorAggregatesBatch(donorIds, churchId, undefined),
    ]);

  let givingCents = 0;
  let previousYearGivingCents = 0;
  let comparisonGivingCents = 0;
  let comparisonGiftCount = 0;
  let lifetimeGivingCents = 0;
  let giftCount = 0;
  let givingDonors = 0;
  let priorYearDonors = 0;
  let priorYearAndNow = 0;
  for (const id of donorIds) {
    const now = periodAgg.get(id);
    const before = previousYearAgg.get(id);
    givingCents += now?.netDonatedCents ?? 0;
    previousYearGivingCents += before?.netDonatedCents ?? 0;
    comparisonGivingCents += comparisonAgg.get(id)?.netDonatedCents ?? 0;
    comparisonGiftCount += comparisonAgg.get(id)?.donationCount ?? 0;
    lifetimeGivingCents += lifetimeAgg.get(id)?.netDonatedCents ?? 0;
    giftCount += now?.donationCount ?? 0;
    const gaveNow = (now?.donationCount ?? 0) > 0;
    const gaveBefore = (before?.donationCount ?? 0) > 0;
    if (gaveNow) givingDonors += 1;
    if (gaveBefore) priorYearDonors += 1;
    if (gaveBefore && gaveNow) priorYearAndNow += 1;
  }

  const retention = computeRetention({
    gaveBefore: priorYearDonors,
    gaveBeforeAndNow: priorYearAndNow,
  });

  return {
    totalDonors,
    newDonors: analytics.newVsReturning.newCount,
    returningDonors: analytics.newVsReturning.returningCount,
    recurringDonors: analytics.oneTimeVsRecurring.uniqueRecurringDonors,
    lapsedDonors: retention.lapsed,
    averageGiftCents: giftCount > 0 ? Math.round(givingCents / giftCount) : 0,
    ytdGivingCents: givingCents,
    previousYearGivingCents,
    lifetimeGivingCents,
    donorRetentionRatePercent: retention.ratePercent,
    priorYearDonors,
    givingDonors,
    giftCount,
    comparisonGivingCents,
    comparisonAverageGiftCents:
      comparisonGiftCount > 0
        ? Math.round(comparisonGivingCents / comparisonGiftCount)
        : 0,
  };
}

/** Year of the first successful gift (WGC-processed or external), or null when there is none — drives the year selector. */
export async function loadFirstGiftYear(
  churchId: string,
): Promise<number | null> {
  const [payment, external] = await Promise.all([
    prisma.payment.aggregate({
      where: { churchId, status: "SUCCEEDED" },
      _min: { createdAt: true },
    }),
    prisma.externalDonation.aggregate({
      where: { churchId, status: { not: "VOIDED" } },
      _min: { donationDate: true },
    }),
  ]);
  const dates = [payment._min.createdAt, external._min.donationDate].filter(
    (d): d is Date => !!d,
  );
  if (dates.length === 0) return null;
  return Math.min(...dates.map((d) => d.getFullYear()));
}
