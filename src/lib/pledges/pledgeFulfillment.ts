import { prisma } from "@/lib/prisma";

/**
 * Sums fulfillment evidence for one Pledge — an ExternalDonation (offline,
 * cash/check) and/or a Payment (online, via the public campaign page's
 * "Give now" action) tagged with this pledge's id — and writes the rollup
 * onto the Pledge row. Mirrors loadTransferStatsBatch's "sum tagged rows,
 * cache the result on the parent" convention in subscriptionAggregates.ts.
 * Called synchronously right after a fulfillment is linked, not on a
 * schedule — pledge fulfillment volume is small and event-driven.
 */
export async function computePledgeFulfillment(pledgeId: string): Promise<void> {
  const pledge = await prisma.pledge.findUnique({ where: { id: pledgeId } });
  if (!pledge || pledge.status === "CANCELED") return;

  const [externalDonations, payments] = await Promise.all([
    prisma.externalDonation.findMany({
      where: { pledgeId, status: { notIn: ["RETURNED", "VOIDED"] } },
      select: { donationAmountCents: true },
    }),
    prisma.payment.findMany({
      where: { pledgeId, status: "SUCCEEDED" },
      select: { amountCents: true, donationAmountCents: true },
    }),
  ]);

  const fulfilledAmountCents =
    externalDonations.reduce((sum, d) => sum + (d.donationAmountCents ?? 0), 0) +
    payments.reduce((sum, p) => sum + (p.donationAmountCents ?? p.amountCents ?? 0), 0);

  const status =
    fulfilledAmountCents <= 0
      ? "PROMISED"
      : fulfilledAmountCents >= pledge.pledgeAmountCents
        ? "FULFILLED"
        : "PARTIALLY_FULFILLED";

  await prisma.pledge.update({
    where: { id: pledgeId },
    data: {
      fulfilledAmountCents,
      status,
      fulfilledAt: status === "FULFILLED" ? (pledge.fulfilledAt ?? new Date()) : null,
    },
  });
}

export interface CampaignProgress {
  pledgeCount: number;
  totalPledgedCents: number;
  totalFulfilledCents: number;
  /** Successful online gifts through the campaign's "Give now" GivingLink
   * that were never tied to a pledge — see computeDirectDonationsCents. 0
   * when the campaign has no givingLinkId. */
  totalDirectDonationCents: number;
  /** totalFulfilledCents + totalDirectDonationCents — the figure the public
   * campaign page's progress bar and percentOfGoal are based on, so a
   * donor who gives directly without pledging first is actually reflected
   * in "amount raised." totalFulfilledCents/totalPledgedCents keep their
   * original, narrower meaning (pledge-only) for existing merchant-side
   * reporting that specifically cares about pledge fulfillment rates. */
  totalRaisedCents: number;
  goalAmountCents: number | null;
  percentOfGoal: number | null;
}

/**
 * Sums successful Payments through a GivingLink that were never tied to a
 * pledge (pledgeId null) — i.e. a donor who clicked "Give now" on a
 * pledge campaign's public page without creating a pledge first. Nets out
 * refunds via FinixRefundOrReversal (matched by finixTransferId, the same
 * join the Finix webhook handler itself uses to keep
 * GivingLink.refundedCents accurate), since Payment.status is never
 * rewritten on refund — a refund is always a separate reversal record,
 * never a status change on the original payment. Floors at 0 so a
 * data anomaly (e.g. a refund recorded before its original payment
 * syncs) can never produce a negative "amount raised."
 */
export async function computeDirectDonationsCents(churchId: string, givingLinkId: string | null): Promise<number> {
  if (!givingLinkId) return 0;

  const payments = await prisma.payment.findMany({
    where: { churchId, givingLinkId, pledgeId: null, status: "SUCCEEDED" },
    select: { donationAmountCents: true, amountCents: true, finixTransferId: true },
  });
  if (payments.length === 0) return 0;

  const grossCents = payments.reduce((sum, p) => sum + (p.donationAmountCents ?? p.amountCents), 0);

  const transferIds = payments.map((p) => p.finixTransferId).filter((id): id is string => !!id);
  const refunds = transferIds.length
    ? await prisma.finixRefundOrReversal.findMany({
        where: { churchId, finixOriginalTransferId: { in: transferIds }, state: "SUCCEEDED" },
        select: { amountCents: true },
      })
    : [];
  const refundedCents = refunds.reduce((sum, r) => sum + (r.amountCents ?? 0), 0);

  return Math.max(0, grossCents - refundedCents);
}

/**
 * Computed on read, same convention as lifetimeCollectedCents elsewhere in
 * this codebase — no cached aggregate table. Nonprofit campaign pledge
 * counts are small (hundreds, not millions), so summing on every campaign
 * detail-page load is cheap and always exactly correct.
 */
export async function computeCampaignProgress(churchId: string, pledgeCampaignId: string): Promise<CampaignProgress> {
  const [campaign, pledges] = await Promise.all([
    prisma.pledgeCampaign.findFirst({ where: { id: pledgeCampaignId, churchId }, select: { goalAmountCents: true, givingLinkId: true } }),
    prisma.pledge.findMany({
      where: { churchId, pledgeCampaignId, status: { not: "CANCELED" } },
      select: { pledgeAmountCents: true, fulfilledAmountCents: true },
    }),
  ]);

  const totalPledgedCents = pledges.reduce((sum, p) => sum + p.pledgeAmountCents, 0);
  const totalFulfilledCents = pledges.reduce((sum, p) => sum + p.fulfilledAmountCents, 0);
  const totalDirectDonationCents = await computeDirectDonationsCents(churchId, campaign?.givingLinkId ?? null);
  const totalRaisedCents = totalFulfilledCents + totalDirectDonationCents;
  const goalAmountCents = campaign?.goalAmountCents ?? null;

  return {
    pledgeCount: pledges.length,
    totalPledgedCents,
    totalFulfilledCents,
    totalDirectDonationCents,
    totalRaisedCents,
    goalAmountCents,
    percentOfGoal: goalAmountCents ? Math.min(100, Math.round((totalRaisedCents / goalAmountCents) * 100)) : null,
  };
}
