import { prisma } from "@/lib/prisma";
import { resolvePriorMonthRange, getSmsUsageForPeriod } from "@/lib/giving/smsUsage";

/**
 * Monthly overage check for every ACTIVE SmsAddonSubscription. Runs from
 * /api/cron/sms-addon-overage-check on the 1st of each month, checking the
 * calendar month that just completed — same shape as
 * promoShortfallDetection.ts, including its most important property:
 * deliberately review-first, not auto-charging. This only ever creates
 * FLAGGED rows for a WGC billing admin to review — see
 * smsAddonOverageCharge.ts for the actual (admin-triggered) charge/waive
 * actions. Nothing in this file ever calls Finix or moves money.
 */

export interface SmsOverageDetectionResult {
  subscriptionsChecked: number;
  alreadyFlagged: number;
  newlyFlagged: number;
  withinAllowance: number;
}

export async function detectSmsOverages(now: Date = new Date()): Promise<SmsOverageDetectionResult> {
  const { start, end, billingPeriod } = resolvePriorMonthRange(now);

  const activeSubscriptions = await prisma.smsAddonSubscription.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, organizationId: true, includedTexts: true, overageRateCents: true, createdAt: true },
  });

  const result: SmsOverageDetectionResult = {
    subscriptionsChecked: activeSubscriptions.length,
    alreadyFlagged: 0,
    newlyFlagged: 0,
    withinAllowance: 0,
  };

  for (const sub of activeSubscriptions) {
    // Wasn't subscribed for any part of the prior month — nothing to check yet.
    if (sub.createdAt >= end) continue;

    const existing = await prisma.smsAddonOverageCharge.findUnique({
      where: { organizationId_billingPeriod: { organizationId: sub.organizationId, billingPeriod } },
    });
    if (existing) {
      result.alreadyFlagged++;
      continue;
    }

    const textsSent = await getSmsUsageForPeriod(sub.organizationId, start, end);
    const overageTexts = Math.max(0, textsSent - sub.includedTexts);

    if (overageTexts === 0) {
      result.withinAllowance++;
      continue;
    }

    try {
      await prisma.smsAddonOverageCharge.create({
        data: {
          organizationId: sub.organizationId,
          billingPeriod,
          textsIncluded: sub.includedTexts,
          textsSent,
          overageTexts,
          overageRateCents: sub.overageRateCents,
          chargeAmountCents: overageTexts * sub.overageRateCents,
          status: "FLAGGED",
        },
      });
      result.newlyFlagged++;
    } catch (err) {
      // Unique constraint on (organizationId, billingPeriod) — a concurrent
      // run (or a retry) already flagged this org/month. Not an error.
      if (err instanceof Error && "code" in err && (err as { code?: string }).code === "P2002") {
        result.alreadyFlagged++;
        continue;
      }
      throw err;
    }
  }

  return result;
}
