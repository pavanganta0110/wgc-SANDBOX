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
  goalAmountCents: number | null;
  percentOfGoal: number | null;
}

/**
 * Computed on read, same convention as lifetimeCollectedCents elsewhere in
 * this codebase — no cached aggregate table. Nonprofit campaign pledge
 * counts are small (hundreds, not millions), so summing on every campaign
 * detail-page load is cheap and always exactly correct.
 */
export async function computeCampaignProgress(churchId: string, pledgeCampaignId: string): Promise<CampaignProgress> {
  const [campaign, pledges] = await Promise.all([
    prisma.pledgeCampaign.findFirst({ where: { id: pledgeCampaignId, churchId }, select: { goalAmountCents: true } }),
    prisma.pledge.findMany({
      where: { churchId, pledgeCampaignId, status: { not: "CANCELED" } },
      select: { pledgeAmountCents: true, fulfilledAmountCents: true },
    }),
  ]);

  const totalPledgedCents = pledges.reduce((sum, p) => sum + p.pledgeAmountCents, 0);
  const totalFulfilledCents = pledges.reduce((sum, p) => sum + p.fulfilledAmountCents, 0);
  const goalAmountCents = campaign?.goalAmountCents ?? null;

  return {
    pledgeCount: pledges.length,
    totalPledgedCents,
    totalFulfilledCents,
    goalAmountCents,
    percentOfGoal: goalAmountCents ? Math.min(100, Math.round((totalFulfilledCents / goalAmountCents) * 100)) : null,
  };
}
