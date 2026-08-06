import { prisma } from "@/lib/prisma";
import {
  loadDonorAggregatesBatch,
  externalDonationEligibilityWhere,
  isExternalDonationDeposited,
} from "@/lib/donors/donorAggregates";
import { loadDonorRiskSignals } from "@/lib/donors/donorRiskSignals";
import {
  resolveDonorDisplayStatus,
  resolveDonorNeedsAttentionReasons,
} from "@/lib/donors/donorStatus";
import { DONOR_CANDIDATE_CAP } from "@/lib/donors/donorsList";
import type { DateRangeFilter } from "@/lib/donors/donorAggregates";

export interface DonorSummary {
  totalDonors: number;
  activeDonors: number;
  newDonors: number;
  recurringDonors: number;
  totalDonatedCents: number;
  averageDonationCents: number;
  /** Portion of totalDonatedCents that came from ExternalDonation rows — see
   * DonorAggregates.externalDonatedCents for the same per-donor split. */
  externalDonatedCents: number;
  wgcProcessedCents: number;
  donorsWithFailedPayments: number;
  donorsRequiringAttention: number;
  candidateCapReached: boolean;
}

/**
 * Total Donors and Total/Average Donated are real single-query SQL
 * aggregates (prisma.donor.count / prisma.finixTransfer.aggregate,
 * prisma.externalDonation.aggregate, prisma.invoicePayment queries) — not
 * bounded, correct at any organization size. These three sources are the
 * exact same ones — and the exact same eligibility rules — that
 * donorAggregates.ts folds into each donor's individual total, so this
 * org-wide summary can never drift from "sum of every donor's Total
 * Donated" on the same page. Active/New/Recurring/Failed/Attention require
 * classifying each donor's cross-table status (donation history +
 * subscriptions + disputes + returns), which has no single-query SQL form
 * without a materialized view — computed server-side, in one request, over
 * a bounded candidate set (see DONOR_CANDIDATE_CAP in donorsList.ts) rather
 * than client-side, which is the distinction the "no loading all donors
 * into the browser" rule is actually protecting against.
 */
export async function loadDonorSummary(
  churchId: string,
  dateFilter?: DateRangeFilter,
  donorIdIn?: string[],
): Promise<DonorSummary> {
  const totalDonors = await prisma.donor.count({
    where: {
      churchId,
      archivedAt: null,
      ...(donorIdIn ? { id: { in: donorIdIn } } : {}),
    },
  });

  const instruments = await prisma.finixPaymentInstrumentSnapshot.findMany({
    where: { churchId, donorId: donorIdIn ? { in: donorIdIn } : { not: null } },
    select: { finixPaymentInstrumentId: true },
  });
  const instrumentIds = instruments.map((i) => i.finixPaymentInstrumentId);

  const [wgcProcessedAgg, externalAgg, invoiceContribution] = await Promise.all(
    [
      instrumentIds.length
        ? prisma.finixTransfer.aggregate({
            where: {
              churchId,
              finixPaymentInstrumentId: { in: instrumentIds },
              state: "SUCCEEDED",
              ...(dateFilter ? { createdAtFinix: dateFilter } : {}),
            },
            _sum: { amountCents: true },
            _count: true,
          })
        : Promise.resolve({ _sum: { amountCents: 0 }, _count: 0 }),
      prisma.externalDonation.findMany({
        where: externalDonationEligibilityWhere(churchId, {
          donorIds: donorIdIn,
          dateFilter,
        }),
        select: { donationAmountCents: true, depositStatus: true },
      }),
      loadCharitableInvoiceTotal(churchId, dateFilter, donorIdIn),
    ],
  );

  const wgcProcessedCents = wgcProcessedAgg._sum.amountCents ?? 0;
  const depositedExternalRows = externalAgg.filter(isExternalDonationDeposited);
  const externalDonatedCents = depositedExternalRows.reduce((sum, r) => sum + r.donationAmountCents, 0);
  const totalDonatedCents =
    wgcProcessedCents + externalDonatedCents + invoiceContribution.totalCents;
  const donationCount =
    wgcProcessedAgg._count + depositedExternalRows.length + invoiceContribution.count;
  const averageDonationCents =
    donationCount > 0 ? Math.round(totalDonatedCents / donationCount) : 0;

  const candidates = await prisma.donor.findMany({
    where: {
      churchId,
      archivedAt: null,
      ...(donorIdIn ? { id: { in: donorIdIn } } : {}),
    },
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
  const [lifetimeAggregatesMap, periodAggregatesMap, riskSignalsMap] =
    await Promise.all([
      loadDonorAggregatesBatch(donorIds, churchId),
      dateFilter
        ? loadDonorAggregatesBatch(donorIds, churchId, dateFilter)
        : Promise.resolve(null),
      loadDonorRiskSignals(donorIds, churchId),
    ]);

  let activeDonors = 0;
  let newDonors = 0;
  let recurringDonors = 0;
  let donorsWithFailedPayments = 0;
  let donorsRequiringAttention = 0;

  for (const donorId of donorIds) {
    const lifetime = lifetimeAggregatesMap.get(donorId)!;
    const period = periodAggregatesMap
      ? periodAggregatesMap.get(donorId)!
      : lifetime;
    const riskInput = riskSignalsMap.get(donorId)!;
    const status = resolveDonorDisplayStatus(riskInput);

    if (period.donationCount > 0) activeDonors += 1;
    if (
      dateFilter &&
      lifetime.firstDonationAt &&
      lifetime.firstDonationAt >= dateFilter.gte &&
      (!dateFilter.lte || lifetime.firstDonationAt <= dateFilter.lte)
    ) {
      newDonors += 1;
    } else if (!dateFilter && lifetime.donationCount > 0) {
      newDonors += 1;
    }
    if (riskInput.hasActiveSubscription) recurringDonors += 1;
    if (period.failedPaymentCount > 0) donorsWithFailedPayments += 1;
    if (
      status === "AT_RISK" ||
      resolveDonorNeedsAttentionReasons(riskInput).length > 0
    )
      donorsRequiringAttention += 1;
  }

  return {
    totalDonors,
    activeDonors,
    newDonors,
    recurringDonors,
    totalDonatedCents,
    averageDonationCents,
    externalDonatedCents,
    wgcProcessedCents: wgcProcessedCents + invoiceContribution.totalCents,
    donorsWithFailedPayments,
    donorsRequiringAttention,
    candidateCapReached: candidates.length === DONOR_CANDIDATE_CAP,
  };
}

/**
 * Org-wide charitable-invoice contribution, using the exact same
 * classification/fee/refund math as loadInvoiceContributionsByDonor in
 * donorAggregates.ts (kept in sync deliberately — a GOODS_OR_SERVICES
 * invoice is never a donation). Not exported from donorAggregates.ts since
 * that module's version is keyed by donorIds for per-donor batching; this
 * is the org-wide-total equivalent.
 */
async function loadCharitableInvoiceTotal(
  churchId: string,
  dateFilter?: DateRangeFilter,
  donorIdIn?: string[],
): Promise<{ totalCents: number; count: number }> {
  const invoices = await prisma.invoice.findMany({
    where: {
      churchId,
      classification: { in: ["CHARITABLE_DONATION", "PARTIAL_DONATION"] },
      linkedDonorId: donorIdIn ? { in: donorIdIn } : { not: null },
    },
    select: { id: true },
  });
  if (invoices.length === 0) return { totalCents: 0, count: 0 };

  const payments = await prisma.invoicePayment.findMany({
    where: {
      churchId,
      invoiceId: { in: invoices.map((i) => i.id) },
      status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED"] },
      ...(dateFilter ? { createdAt: dateFilter } : {}),
    },
    select: {
      grossAmountCents: true,
      refundedCents: true,
      feeContributionCents: true,
      feeContributionRefundedCents: true,
      customerCoveredFee: true,
    },
  });

  let totalCents = 0;
  let count = 0;
  for (const p of payments) {
    const netPrincipalCents = Math.max(0, p.grossAmountCents - p.refundedCents);
    const netFeeCents = p.customerCoveredFee
      ? Math.max(0, p.feeContributionCents - p.feeContributionRefundedCents)
      : 0;
    const finalCents = netPrincipalCents + netFeeCents;
    if (finalCents <= 0) continue;
    totalCents += finalCents;
    count += 1;
  }
  return { totalCents, count };
}
