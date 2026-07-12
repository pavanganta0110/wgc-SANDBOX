import { prisma } from "@/lib/prisma";
import { loadSubscriptionCandidates } from "@/lib/subscriptions/subscriptionAggregates";
import { frequencyLabel, normalizeToMonthlyValueCents } from "@/lib/subscriptions/subscriptionStatus";

export interface SubscriptionsAnalytics {
  summary: {
    activeSubscriptions: number;
    pausedSubscriptions: number;
    pastDueSubscriptions: number;
    canceledSubscriptions: number;
    completedSubscriptions: number;
    failedSubscriptions: number;
    monthlyRecurringValueCents: number;
    annualizedRecurringValueCents: number;
    upcomingCharges: { count: number; amountCents: number };
    failedThisMonth: number;
    subscriptionsRequiringAttention: number;
    lifetimeRecurringCollectedCents: number;
  };
  growth: { created: number; activated: number; canceled: number; completed: number };
  statusBreakdown: Record<string, number>;
  frequencyMix: { frequency: string; subscriptionCount: number; monthlyValueCents: number }[];
  paymentPerformance: { succeeded: number; failed: number; pending: number; refunded: number; achReturned: number; disputed: number };
  cancellationTrend: { count: number; monthlyValueLostCents: number };
  attentionList: {
    subscriptionId: string;
    donorName: string;
    reasons: string[];
    amountCents: number;
    nextBillingDate: Date | null;
  }[];
  candidateCapReached: boolean;
}

export async function loadSubscriptionsAnalytics(churchId: string, rangeDays = 30): Promise<SubscriptionsAnalytics> {
  const periodStart = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);
  const subscriptions = await loadSubscriptionCandidates(churchId);

  const active = subscriptions.filter((s) => s.displayStatus === "ACTIVE");
  const paused = subscriptions.filter((s) => s.displayStatus === "PAUSED");
  const pastDue = subscriptions.filter((s) => s.displayStatus === "PAST_DUE");
  const canceled = subscriptions.filter((s) => s.displayStatus === "CANCELED");
  const completed = subscriptions.filter((s) => s.displayStatus === "COMPLETED");
  const failed = subscriptions.filter((s) => s.displayStatus === "FAILED");

  const monthlyRecurringValueCents = active.reduce((sum, s) => sum + s.monthlyValueCents, 0);

  const now = Date.now();
  const in30Days = now + 30 * 24 * 60 * 60 * 1000;
  const upcoming = active.filter((s) => s.nextBillingDate && s.nextBillingDate.getTime() <= in30Days);

  const failedThisMonth = subscriptions.filter((s) => s.lastFailure && s.lastFailure.date >= periodStart).length;
  const lifetimeRecurringCollectedCents = subscriptions.reduce((sum, s) => sum + s.lifetimeCollectedCents, 0);

  const created = subscriptions.filter((s) => s.createdAt >= periodStart).length;
  const activated = subscriptions.filter((s) => s.startDate && s.startDate >= periodStart).length;
  const canceledInPeriod = subscriptions.filter((s) => s.canceledAt && s.canceledAt >= periodStart);
  const completedInPeriod = subscriptions.filter((s) => s.completedAt && s.completedAt >= periodStart).length;

  const statusBreakdown: Record<string, number> = {};
  for (const s of subscriptions) statusBreakdown[s.displayStatus] = (statusBreakdown[s.displayStatus] || 0) + 1;

  const frequencyMix = new Map<string, { subscriptionCount: number; monthlyValueCents: number }>();
  for (const s of active) {
    const label = frequencyLabel(s.billingInterval);
    const entry = frequencyMix.get(label) ?? { subscriptionCount: 0, monthlyValueCents: 0 };
    entry.subscriptionCount += 1;
    entry.monthlyValueCents += s.monthlyValueCents;
    frequencyMix.set(label, entry);
  }

  const finixSubscriptionIds = subscriptions.map((s) => s.finixSubscriptionId);
  let succeeded = 0, failedCount = 0, pending = 0, refunded = 0, achReturned = 0, disputed = 0;
  if (finixSubscriptionIds.length) {
    const recurringTransfers = await prisma.finixTransfer.findMany({
      where: { churchId, finixSubscriptionId: { in: finixSubscriptionIds } },
      select: { finixTransferId: true, state: true },
    });
    succeeded = recurringTransfers.filter((t) => t.state === "SUCCEEDED").length;
    failedCount = recurringTransfers.filter((t) => t.state === "FAILED").length;
    pending = recurringTransfers.filter((t) => t.state === "PENDING").length;
    const recurringTransferIds = recurringTransfers.map((t) => t.finixTransferId);
    [refunded, achReturned, disputed] = await Promise.all([
      prisma.finixRefundOrReversal.count({ where: { churchId, finixOriginalTransferId: { in: recurringTransferIds } } }),
      prisma.bankReturn.count({ where: { churchId, originalTransferId: { in: recurringTransferIds } } }),
      prisma.finixDispute.count({ where: { churchId, finixTransferId: { in: recurringTransferIds } } }),
    ]);
  }

  const attentionList = subscriptions
    .filter((s) => s.requiresAttention)
    .sort((a, b) => b.failedAttempts - a.failedAttempts)
    .slice(0, 10)
    .map((s) => ({
      subscriptionId: s.id,
      donorName: s.donorName,
      reasons: s.attentionReasons,
      amountCents: s.amountCents,
      nextBillingDate: s.nextBillingDate,
    }));

  return {
    summary: {
      activeSubscriptions: active.length,
      pausedSubscriptions: paused.length,
      pastDueSubscriptions: pastDue.length,
      canceledSubscriptions: canceled.length,
      completedSubscriptions: completed.length,
      failedSubscriptions: failed.length,
      monthlyRecurringValueCents,
      annualizedRecurringValueCents: monthlyRecurringValueCents * 12,
      upcomingCharges: { count: upcoming.length, amountCents: upcoming.reduce((sum, s) => sum + s.amountCents, 0) },
      failedThisMonth,
      subscriptionsRequiringAttention: subscriptions.filter((s) => s.requiresAttention).length,
      lifetimeRecurringCollectedCents,
    },
    growth: { created, activated, canceled: canceledInPeriod.length, completed: completedInPeriod },
    statusBreakdown,
    frequencyMix: [...frequencyMix.entries()].map(([frequency, v]) => ({ frequency, ...v })),
    paymentPerformance: { succeeded, failed: failedCount, pending, refunded, achReturned, disputed },
    cancellationTrend: {
      count: canceledInPeriod.length,
      // A canceled subscription's own monthlyValueCents is zeroed by resolveSubscriptionDisplayStatus (only ACTIVE schedules count toward current recurring value), so "value lost" is recomputed here from the raw amount/interval it had before cancellation.
      monthlyValueLostCents: canceledInPeriod.reduce((sum, s) => sum + normalizeToMonthlyValueCents(s.amountCents, s.billingInterval), 0),
    },
    attentionList,
    candidateCapReached: subscriptions.length >= 2000,
  };
}
