import { prisma } from "@/lib/prisma";
import { aggregateTransfers } from "@/lib/reports/dashboardAggregates";

/**
 * Monthly compliance check for the six-months-free promo's minimum-
 * processing condition ("offer valid for organizations processing at
 * least $100/month" — see src/app/90-days-free/page.tsx). Runs from
 * /api/cron/promo-shortfall-check on the 1st of each month, checking the
 * calendar month that just completed.
 *
 * Deliberately review-first, not auto-charging: this function only ever
 * creates FLAGGED rows for a WGC billing admin to review — see
 * promoShortfallCharge.ts for the actual (admin-triggered) charge/waive
 * actions. Nothing in this file ever calls Finix or moves money.
 */

export const MINIMUM_MONTHLY_PROCESSING_CENTS = 10_000; // $100.00

export interface PromoShortfallDetectionResult {
  entitlementsChecked: number;
  alreadyFlagged: number;
  skippedNotFullMonth: number;
  newlyFlagged: number;
  compliant: number;
}

/** [inclusive start, exclusive end) UTC boundaries of the calendar month
 * immediately before `now`. */
export function resolvePriorMonthRange(now: Date): { start: Date; end: Date; billingPeriod: string } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 1));
  const billingPeriod = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
  return { start, end, billingPeriod };
}

export async function detectPromoShortfalls(now: Date = new Date()): Promise<PromoShortfallDetectionResult> {
  const { start, end, billingPeriod } = resolvePriorMonthRange(now);

  const activeEntitlements = await prisma.promotionEntitlement.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, organizationId: true, startsAt: true, normalMonthlyAmountCents: true },
  });

  const result: PromoShortfallDetectionResult = {
    entitlementsChecked: activeEntitlements.length,
    alreadyFlagged: 0,
    skippedNotFullMonth: 0,
    newlyFlagged: 0,
    compliant: 0,
  };

  for (const entitlement of activeEntitlements) {
    // The promo wasn't active for the entire prior month (e.g. the org
    // signed up mid-month, or its promo hasn't started yet) — never flag a
    // partial month, since the org couldn't reasonably have processed a
    // full month's minimum yet.
    if (!entitlement.startsAt || entitlement.startsAt > start) {
      result.skippedNotFullMonth++;
      continue;
    }

    const existing = await prisma.promoShortfallCharge.findUnique({
      where: { organizationId_billingPeriod: { organizationId: entitlement.organizationId, billingPeriod } },
    });
    if (existing) {
      result.alreadyFlagged++;
      continue;
    }

    const { succeededVolumeCents } = await aggregateTransfers({
      churchId: entitlement.organizationId,
      createdAtFinix: { gte: start, lt: end },
    });

    if (succeededVolumeCents >= MINIMUM_MONTHLY_PROCESSING_CENTS) {
      result.compliant++;
      continue;
    }

    try {
      await prisma.promoShortfallCharge.create({
        data: {
          organizationId: entitlement.organizationId,
          promotionEntitlementId: entitlement.id,
          billingPeriod,
          processedVolumeCents: succeededVolumeCents,
          thresholdCents: MINIMUM_MONTHLY_PROCESSING_CENTS,
          chargeAmountCents: entitlement.normalMonthlyAmountCents,
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
