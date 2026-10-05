import { prisma } from "@/lib/prisma";

export interface RecoveryAttemptRow {
  id: string;
  finixSubscriptionId: string;
  donorId: string | null;
  action: string;
  createdAt: Date;
}

export interface RecoveryAnalytics {
  rangeDays: number;
  failedPaymentCount: number;
  failedSubscriptionCount: number;
  recoveredSubscriptionCount: number;
  recoveryRatePct: number;
  recentAttempts: RecoveryAttemptRow[];
}

/**
 * A subscription counts as "recovered" if any recurring charge succeeded
 * strictly after its earliest failure in the window — same definition
 * recurringPaymentEvents.ts uses to decide recurring.payment_recovered, so
 * this metric and that event always agree on what "recovered" means.
 */
export async function loadRecoveryAnalytics(churchId: string, rangeDays = 30): Promise<RecoveryAnalytics> {
  const periodStart = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);

  const failedPayments = await prisma.payment.findMany({
    where: { churchId, status: "FAILED", finixSubscriptionId: { not: null }, createdAt: { gte: periodStart } },
    select: { finixSubscriptionId: true, createdAt: true },
  });

  const earliestFailureBySubscription = new Map<string, Date>();
  for (const p of failedPayments) {
    const subId = p.finixSubscriptionId!;
    const existing = earliestFailureBySubscription.get(subId);
    if (!existing || p.createdAt < existing) earliestFailureBySubscription.set(subId, p.createdAt);
  }
  const failedSubscriptionIds = [...earliestFailureBySubscription.keys()];

  let recoveredSubscriptionCount = 0;
  if (failedSubscriptionIds.length > 0) {
    const succeededPayments = await prisma.payment.findMany({
      where: { churchId, status: "SUCCEEDED", finixSubscriptionId: { in: failedSubscriptionIds } },
      select: { finixSubscriptionId: true, createdAt: true },
    });
    const recoveredSet = new Set<string>();
    for (const s of succeededPayments) {
      const failedAt = earliestFailureBySubscription.get(s.finixSubscriptionId!);
      if (failedAt && s.createdAt > failedAt) recoveredSet.add(s.finixSubscriptionId!);
    }
    recoveredSubscriptionCount = recoveredSet.size;
  }

  const recentAttempts = await prisma.subscriptionRecoveryAttempt.findMany({
    where: { churchId, createdAt: { gte: periodStart } },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, finixSubscriptionId: true, donorId: true, action: true, createdAt: true },
  });

  return {
    rangeDays,
    failedPaymentCount: failedPayments.length,
    failedSubscriptionCount: failedSubscriptionIds.length,
    recoveredSubscriptionCount,
    recoveryRatePct: failedSubscriptionIds.length > 0 ? Math.round((recoveredSubscriptionCount / failedSubscriptionIds.length) * 100) : 0,
    recentAttempts,
  };
}
