import { prisma } from "@/lib/prisma";

/**
 * "What would Planning Center have charged?" for the last 30 days, from WGC's own payments. Uses Planning Center's
 * published US rates (2.15% + $0.30 per card gift, $0.30 per bank gift). It is an estimate for the church to read, never
 * something we charge or send anywhere.
 */

export const PCO_CARD_PERCENT = 0.0215;
export const PCO_PER_GIFT_CENTS = 30;
export const ACTIVITY_DAYS = 30;

export interface GiftActivity {
  days: number;
  gifts: number;
  cardGifts: number;
  bankGifts: number;
  /** About what Planning Center would have charged to process these same gifts. */
  estimatedPlanningCenterFeeCents: number;
}

export function estimatePlanningCenterFeeCents(card: { count: number; cents: number }, bankCount: number): number {
  return Math.round(card.cents * PCO_CARD_PERCENT) + card.count * PCO_PER_GIFT_CENTS + bankCount * PCO_PER_GIFT_CENTS;
}

export async function getGiftActivity(churchId: string, now: Date = new Date()): Promise<GiftActivity> {
  const since = new Date(now.getTime() - ACTIVITY_DAYS * 24 * 60 * 60 * 1000);
  const payments = await prisma.payment.findMany({
    where: { churchId, status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"] }, createdAt: { gte: since, lte: now } },
    select: { amountCents: true, paymentMethodType: true },
  });
  const card = { count: 0, cents: 0 };
  let bank = 0;
  for (const p of payments) {
    if (p.paymentMethodType === "BANK_ACCOUNT") bank++;
    else {
      card.count++;
      card.cents += p.amountCents;
    }
  }
  return { days: ACTIVITY_DAYS, gifts: payments.length, cardGifts: card.count, bankGifts: bank, estimatedPlanningCenterFeeCents: estimatePlanningCenterFeeCents(card, bank) };
}
