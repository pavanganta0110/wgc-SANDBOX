/**
 * Main Reporting dashboard KPI tiles — composes the existing donor
 * analytics library rather than recomputing donor counts/retention a
 * second, potentially-divergent way (item 38: Donors/Insights/Reporting/
 * Annual Statements must share one source of truth for these numbers).
 */
import { prisma } from "@/lib/prisma";
import type { MerchantAuthContext } from "@/lib/auth/requireMerchantSession";
import { resolveViewScope } from "@/lib/auth/viewScope";
import { resolveScopedDonorIds } from "@/lib/auth/scopes";
import { loadDonorAnalyticsExtended } from "@/lib/donors/donorAnalyticsExtended";
import { loadDonorAggregatesBatch } from "@/lib/donors/donorAggregates";
import { toPrismaDateFilter, ytdRange, previousYearRange } from "./dateRange";
import type { ReportKpis } from "./types";

export async function loadReportingKpis(auth: MerchantAuthContext): Promise<ReportKpis> {
  const churchId = auth.churchId;
  const viewScope = await resolveViewScope(auth);
  const scopedDonorIds = await resolveScopedDonorIds(auth, viewScope);

  const analytics = await loadDonorAnalyticsExtended(churchId, undefined, undefined, scopedDonorIds ?? undefined);

  const donorWhere = { churchId, archivedAt: null, ...(scopedDonorIds ? { id: { in: scopedDonorIds } } : {}) };
  const totalDonors = await prisma.donor.count({ where: donorWhere });

  const donorIds = (
    await prisma.donor.findMany({ where: donorWhere, select: { id: true }, take: 5000 })
  ).map((d) => d.id);

  const [ytdAgg, prevYearAgg, lifetimeAgg] = await Promise.all([
    loadDonorAggregatesBatch(donorIds, churchId, toPrismaDateFilter(ytdRange())),
    loadDonorAggregatesBatch(donorIds, churchId, toPrismaDateFilter(previousYearRange())),
    loadDonorAggregatesBatch(donorIds, churchId, undefined),
  ]);

  let ytdGivingCents = 0;
  let previousYearGivingCents = 0;
  let lifetimeGivingCents = 0;
  let totalGiftCount = 0;
  for (const id of donorIds) {
    ytdGivingCents += ytdAgg.get(id)?.netDonatedCents ?? 0;
    previousYearGivingCents += prevYearAgg.get(id)?.netDonatedCents ?? 0;
    lifetimeGivingCents += lifetimeAgg.get(id)?.netDonatedCents ?? 0;
    totalGiftCount += ytdAgg.get(id)?.donationCount ?? 0;
  }

  return {
    totalDonors,
    newDonors: analytics.newVsReturning.newCount,
    returningDonors: analytics.newVsReturning.returningCount,
    recurringDonors: analytics.oneTimeVsRecurring.uniqueRecurringDonors,
    lapsedDonors: analytics.retention.lapsedDonors,
    averageGiftCents: totalGiftCount > 0 ? Math.round(ytdGivingCents / totalGiftCount) : 0,
    ytdGivingCents,
    previousYearGivingCents,
    lifetimeGivingCents,
    donorRetentionRatePercent: analytics.retention.returningDonorRate ?? 0,
  };
}
