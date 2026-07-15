import { prisma } from "@/lib/prisma";
import { loadDonorAggregatesBatch } from "@/lib/donors/donorAggregates";
import { loadDonorRiskSignals } from "@/lib/donors/donorRiskSignals";
import { resolveDonorDisplayStatus, resolveDonorNeedsAttentionReasons } from "@/lib/donors/donorStatus";
import { DONOR_CANDIDATE_CAP } from "@/lib/donors/donorsList";
import type { DateRangeFilter } from "@/lib/donors/donorAggregates";

export interface DonorSummary {
  totalDonors: number;
  activeDonors: number;
  newDonors: number;
  recurringDonors: number;
  totalDonatedCents: number;
  averageDonationCents: number;
  donorsWithFailedPayments: number;
  donorsRequiringAttention: number;
  candidateCapReached: boolean;
}

/**
 * Total Donors and Total/Average Donated are real single-query SQL
 * aggregates (prisma.donor.count / prisma.finixTransfer.aggregate) — not
 * bounded, correct at any organization size. Active/New/Recurring/Failed/
 * Attention require classifying each donor's cross-table status (donation
 * history + subscriptions + disputes + returns), which has no single-query
 * SQL form without a materialized view — computed server-side, in one
 * request, over a bounded candidate set (see DONOR_CANDIDATE_CAP in
 * donorsList.ts) rather than client-side, which is the distinction the
 * "no loading all donors into the browser" rule is actually protecting
 * against.
 */
export async function loadDonorSummary(churchId: string, dateFilter?: DateRangeFilter): Promise<DonorSummary> {
  const totalDonors = await prisma.donor.count({ where: { churchId, archivedAt: null } });

  const instruments = await prisma.finixPaymentInstrumentSnapshot.findMany({
    where: { churchId, donorId: { not: null } },
    select: { finixPaymentInstrumentId: true },
  });
  const instrumentIds = instruments.map((i) => i.finixPaymentInstrumentId);

  const totalDonatedAgg = instrumentIds.length
    ? await prisma.finixTransfer.aggregate({
        where: {
          churchId,
          finixPaymentInstrumentId: { in: instrumentIds },
          state: "SUCCEEDED",
          ...(dateFilter ? { createdAtFinix: dateFilter } : {}),
        },
        _sum: { amountCents: true },
        _count: true,
      })
    : { _sum: { amountCents: 0 }, _count: 0 };

  const totalDonatedCents = totalDonatedAgg._sum.amountCents ?? 0;
  const donationCount = totalDonatedAgg._count;
  const averageDonationCents = donationCount > 0 ? Math.round(totalDonatedCents / donationCount) : 0;

  const candidates = await prisma.donor.findMany({
    where: { churchId, archivedAt: null },
    select: { id: true, createdAt: true },
    take: DONOR_CANDIDATE_CAP,
  });
  const donorIds = candidates.map((d) => d.id);

  // Lifetime aggregates (no date filter) are what determine whether a
  // donor's *first ever* donation falls in the selected period — a donor
  // who first gave years ago and gave again this month is a returning
  // donor, not new, even though a donation of theirs exists in this
  // window. Period-scoped aggregates are only used for "did they give
  // during this specific window" (Active Donors), a separate question.
  const [lifetimeAggregatesMap, periodAggregatesMap, riskSignalsMap] = await Promise.all([
    loadDonorAggregatesBatch(donorIds, churchId),
    dateFilter ? loadDonorAggregatesBatch(donorIds, churchId, dateFilter) : Promise.resolve(null),
    loadDonorRiskSignals(donorIds, churchId),
  ]);

  let activeDonors = 0;
  let newDonors = 0;
  let recurringDonors = 0;
  let donorsWithFailedPayments = 0;
  let donorsRequiringAttention = 0;

  for (const donorId of donorIds) {
    const lifetime = lifetimeAggregatesMap.get(donorId)!;
    const period = periodAggregatesMap ? periodAggregatesMap.get(donorId)! : lifetime;
    const riskInput = riskSignalsMap.get(donorId)!;
    const status = resolveDonorDisplayStatus(riskInput);

    if (period.donationCount > 0) activeDonors += 1;
    if (dateFilter && lifetime.firstDonationAt && lifetime.firstDonationAt >= dateFilter.gte && (!dateFilter.lte || lifetime.firstDonationAt <= dateFilter.lte)) {
      newDonors += 1;
    } else if (!dateFilter && lifetime.donationCount > 0) {
      newDonors += 1;
    }
    if (riskInput.hasActiveSubscription) recurringDonors += 1;
    if (period.failedPaymentCount > 0) donorsWithFailedPayments += 1;
    if (status === "AT_RISK" || resolveDonorNeedsAttentionReasons(riskInput).length > 0) donorsRequiringAttention += 1;
  }

  return {
    totalDonors,
    activeDonors,
    newDonors,
    recurringDonors,
    totalDonatedCents,
    averageDonationCents,
    donorsWithFailedPayments,
    donorsRequiringAttention,
    candidateCapReached: candidates.length === DONOR_CANDIDATE_CAP,
  };
}
