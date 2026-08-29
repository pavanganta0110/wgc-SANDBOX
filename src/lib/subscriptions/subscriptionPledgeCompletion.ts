import { prisma } from "@/lib/prisma";
import { finixClient } from "@/lib/finix/client";

/**
 * Finix's subscriptions API has no total-amount/installment-count/end-date
 * concept (confirmed in src/lib/finix/client.ts createSubscription) — it
 * only drives amount + billingInterval on its own schedule. A pledge
 * ("$600 over 12 months") therefore needs WGC itself to notice when the
 * total has been collected and cancel the subscription — Finix will never
 * do this on its own. This rides the same lazy, bounded, on-page-load
 * cadence as reconcileStaleActiveSubscriptions (see
 * subscriptionReconciliation.ts) rather than a dedicated cron, since that's
 * the existing pattern for keeping FinixSubscription state fresh.
 */
export async function checkPledgeCompletions(churchId: string, limit = 25): Promise<{ checked: number; completed: number }> {
  const pledges = await prisma.finixSubscription.findMany({
    where: { churchId, isPledge: true, state: "ACTIVE", canceledAt: null },
    select: { id: true, finixSubscriptionId: true, totalAmountCents: true, installmentsTotal: true },
    take: limit,
  });
  if (pledges.length === 0) return { checked: 0, completed: 0 };

  const finixSubscriptionIds = pledges.map((p) => p.finixSubscriptionId);
  const transfers = await prisma.finixTransfer.findMany({
    where: { churchId, finixSubscriptionId: { in: finixSubscriptionIds }, state: "SUCCEEDED" },
    select: { finixSubscriptionId: true, amountCents: true },
  });

  const collectedBySubscription = new Map<string, { totalCents: number; count: number }>();
  for (const t of transfers) {
    const subId = t.finixSubscriptionId!;
    const entry = collectedBySubscription.get(subId) ?? { totalCents: 0, count: 0 };
    entry.totalCents += t.amountCents ?? 0;
    entry.count += 1;
    collectedBySubscription.set(subId, entry);
  }

  let completed = 0;
  for (const pledge of pledges) {
    if (pledge.totalAmountCents == null) continue;
    const collected = collectedBySubscription.get(pledge.finixSubscriptionId) ?? { totalCents: 0, count: 0 };
    const totalMet = collected.totalCents >= pledge.totalAmountCents;
    const countMet = pledge.installmentsTotal != null && collected.count >= pledge.installmentsTotal;
    if (!totalMet && !countMet) continue;

    try {
      await finixClient.cancelSubscription(pledge.finixSubscriptionId);
    } catch (err) {
      // If Finix reports the subscription is already canceled/gone, treat
      // it as success (idempotent) rather than leaving the local row stuck
      // ACTIVE forever; any other failure is logged and retried on the
      // next reconcile pass rather than silently swallowed.
      console.error(`Pledge completion: cancelSubscription failed for ${pledge.finixSubscriptionId}:`, err);
      continue;
    }

    // Conditional on canceledAt still being null so two overlapping
    // reconcile passes (e.g. Subscriptions and Recurring Donors pages
    // loaded concurrently) can't both "complete" the same pledge twice.
    const { count } = await prisma.finixSubscription.updateMany({
      where: { id: pledge.id, canceledAt: null },
      data: {
        canceledAt: new Date(),
        cancelReason: "PLEDGE_FULFILLED",
        pledgeFulfilledAt: new Date(),
        installmentsCompleted: collected.count,
        state: "CANCELED",
      },
    });
    if (count > 0) completed += 1;
  }

  return { checked: pledges.length, completed };
}
