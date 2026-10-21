import { prisma } from "@/lib/prisma";

/**
 * "What does processing cost?" for the last 30 days, from WGC's own payments, shown to the church beside Planning
 * Center's published US rates (2.15% + $0.30 per card gift, $0.30 per bank gift). Both sides are shown so the church
 * can compare; this never claims a saving. It is an estimate for the church to read, never something we charge or send.
 *
 * WGC's side is exact: the rate saved on each payment at charge time, applied to the gift. It counts as the church's
 * cost only when the donor did NOT cover the fee. Planning Center's side assumes the church absorbs the fee, because
 * whether a giver would have covered it there is unknowable.
 */

export const PCO_CARD_PERCENT = 0.0215;
export const PCO_PER_GIFT_CENTS = 30;
export const ACTIVITY_DAYS = 30;

export interface GiftActivity {
  days: number;
  gifts: number;
  cardGifts: number;
  bankGifts: number;
  giftTotalCents: number;
  /** What WGC's processing fees came to on these gifts in total, whoever paid them. Null if any gift has no saved rate. */
  wgcFeesCents: number | null;
  /** The part of that the church paid: gifts where the donor covered the fee cost the church nothing. */
  wgcFeesPaidByChurchCents: number | null;
  /** About what Planning Center would have charged to process the same gifts if the church absorbed the fees. */
  estimatedPlanningCenterFeeCents: number;
}

export function estimatePlanningCenterFeeCents(card: { count: number; cents: number }, bankCount: number): number {
  return Math.round(card.cents * PCO_CARD_PERCENT) + card.count * PCO_PER_GIFT_CENTS + bankCount * PCO_PER_GIFT_CENTS;
}

export async function getGiftActivity(churchId: string, now: Date = new Date()): Promise<GiftActivity> {
  const since = new Date(now.getTime() - ACTIVITY_DAYS * 24 * 60 * 60 * 1000);
  const payments = await prisma.payment.findMany({
    where: { churchId, status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"] }, createdAt: { gte: since, lte: now } },
    select: { amountCents: true, donationAmountCents: true, paymentMethodType: true, percentageBps: true, fixedFeeCents: true, feeCoveredCents: true, donorCoversFee: true },
  });

  const card = { count: 0, cents: 0 };
  let bank = 0;
  let giftTotal = 0;
  let wgcFees = 0;
  let churchPaid = 0;
  let feesKnown = true;
  for (const p of payments) {
    const gift = p.donationAmountCents ?? p.amountCents;
    giftTotal += gift;
    if (p.paymentMethodType === "BANK_ACCOUNT") bank++;
    else {
      card.count++;
      card.cents += gift;
    }
    if (p.percentageBps === null || p.percentageBps === undefined) {
      feesKnown = false;
      continue;
    }
    const fee = Math.round((gift * p.percentageBps) / 10000) + (p.fixedFeeCents ?? 0);
    wgcFees += fee;
    const donorCovered = p.donorCoversFee === true || (p.feeCoveredCents ?? 0) > 0;
    if (!donorCovered) churchPaid += fee;
  }

  return {
    days: ACTIVITY_DAYS,
    gifts: payments.length,
    cardGifts: card.count,
    bankGifts: bank,
    giftTotalCents: giftTotal,
    wgcFeesCents: feesKnown ? wgcFees : null,
    wgcFeesPaidByChurchCents: feesKnown ? churchPaid : null,
    estimatedPlanningCenterFeeCents: estimatePlanningCenterFeeCents(card, bank),
  };
}
