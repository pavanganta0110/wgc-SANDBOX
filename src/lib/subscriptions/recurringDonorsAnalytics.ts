import { prisma } from "@/lib/prisma";
import { loadSubscriptionCandidates, groupSubscriptionsByDonor } from "@/lib/subscriptions/subscriptionAggregates";
import { frequencyLabel, isUpcomingCharge } from "@/lib/subscriptions/subscriptionStatus";

export interface RecurringDonorsAnalytics {
  summary: {
    activeRecurringDonors: number;
    monthlyRecurringValueCents: number;
    annualizedRecurringValueCents: number;
    newRecurringDonors: number;
    pausedRecurringDonors: number;
    pastDueRecurringDonors: number;
    canceledRecurringDonors: number;
    failedRecurringPayments: number;
    donorsRequiringAttention: number;
    upcomingCharges7Days: { count: number; amountCents: number };
    upcomingCharges30Days: { count: number; amountCents: number };
    lifetimeRecurringDonatedCents: number;
    // Active subscriptions with no resolvable donorId — excluded from every
    // donor-grouped figure above (see groupSubscriptionsByDonor), never
    // silently represented as zero recurring donors. Surfaced separately so
    // real active subscriptions are never invisible in this report.
    unlinkedActiveSubscriptions: number;
  };
  frequencyMix: { frequency: string; subscriptionCount: number; donorCount: number; monthlyValueCents: number }[];
  statusBreakdown: Record<string, number>;
  paymentPerformance: { succeeded: number; failed: number; pending: number; refunded: number; achReturned: number; disputed: number };
  attentionList: {
    donorId: string;
    donorName: string;
    reasons: string[];
    monthlyValueCents: number;
    nextBillingDate: Date | null;
    lastFailureDate: Date | null;
    recommendedAction: string;
  }[];
  candidateCapReached: boolean;
}

export async function loadRecurringDonorsAnalytics(
  churchId: string,
  rangeDays = 30,
  attributedUserId?: string
): Promise<RecurringDonorsAnalytics> {
  const periodStart = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);

  const subscriptions = await loadSubscriptionCandidates(churchId, { attributedUserId });
  const donors = groupSubscriptionsByDonor(subscriptions);

  const activeDonors = donors.filter((d) => d.activeSubscriptionCount > 0);
  const monthlyRecurringValueCents = activeDonors.reduce((sum, d) => sum + d.monthlyValueCents, 0);
  const annualizedRecurringValueCents = monthlyRecurringValueCents * 12;

  const newRecurringDonors = donors.filter((d) => d.createdAt >= periodStart).length;
  const pausedDonors = donors.filter((d) => d.overallStatus === "PAUSED").length;
  const pastDueDonors = donors.filter((d) => d.pastDueSubscriptionCount > 0).length;
  const canceledDonors = donors.filter((d) => d.overallStatus === "CANCELED").length;
  const failedRecurringPayments = donors.reduce((sum, d) => sum + d.failedPaymentCount, 0);
  const donorsRequiringAttention = donors.filter((d) => d.requiresAttention).length;
  const lifetimeRecurringDonatedCents = donors.reduce((sum, d) => sum + d.lifetimeRecurringDonatedCents, 0);

  const now = Date.now();
  const in7Days = now + 7 * 24 * 60 * 60 * 1000;
  const in30Days = now + 30 * 24 * 60 * 60 * 1000;
  // A nextBillingDate already in the past is stale, not "upcoming" — see
  // isUpcomingCharge in subscriptionStatus.ts. Reconciliation (see
  // subscriptionReconciliation.ts) is what actually corrects a stale date;
  // this is defense-in-depth so a not-yet-reconciled row is never counted
  // as upcoming in the meantime.
  const upcoming7 = subscriptions.filter((s) => s.displayStatus === "ACTIVE" && isUpcomingCharge(s.nextBillingDate, now, in7Days));
  const upcoming30 = subscriptions.filter((s) => s.displayStatus === "ACTIVE" && isUpcomingCharge(s.nextBillingDate, now, in30Days));

  const activeSubs = subscriptions.filter((s) => s.displayStatus === "ACTIVE");
  const frequencyMix = new Map<string, { subscriptionCount: number; monthlyValueCents: number; donorIds: Set<string> }>();
  for (const s of activeSubs) {
    const label = frequencyLabel(s.billingInterval);
    const entry = frequencyMix.get(label) ?? { subscriptionCount: 0, monthlyValueCents: 0, donorIds: new Set<string>() };
    entry.subscriptionCount += 1;
    entry.monthlyValueCents += s.monthlyValueCents;
    if (s.donorId) entry.donorIds.add(s.donorId);
    frequencyMix.set(label, entry);
  }

  const statusBreakdown: Record<string, number> = {};
  for (const d of donors) statusBreakdown[d.overallStatus] = (statusBreakdown[d.overallStatus] || 0) + 1;

  const finixSubscriptionIds = subscriptions.map((s) => s.finixSubscriptionId);
  let succeeded = 0, failed = 0, pending = 0, refunded = 0, achReturned = 0, disputed = 0;
  if (finixSubscriptionIds.length) {
    const recurringTransfers = await prisma.finixTransfer.findMany({
      where: { churchId, finixSubscriptionId: { in: finixSubscriptionIds } },
      select: { finixTransferId: true, state: true },
    });
    succeeded = recurringTransfers.filter((t) => t.state === "SUCCEEDED").length;
    failed = recurringTransfers.filter((t) => t.state === "FAILED").length;
    pending = recurringTransfers.filter((t) => t.state === "PENDING").length;

    const recurringTransferIds = recurringTransfers.map((t) => t.finixTransferId);
    [refunded, achReturned, disputed] = await Promise.all([
      prisma.finixRefundOrReversal.count({ where: { churchId, finixOriginalTransferId: { in: recurringTransferIds } } }),
      prisma.bankReturn.count({ where: { churchId, originalTransferId: { in: recurringTransferIds } } }),
      prisma.finixDispute.count({ where: { churchId, finixTransferId: { in: recurringTransferIds } } }),
    ]);
  }

  const attentionList = donors
    .filter((d) => d.requiresAttention)
    .sort((a, b) => b.pastDueSubscriptionCount - a.pastDueSubscriptionCount || b.failedPaymentCount - a.failedPaymentCount)
    .slice(0, 10)
    .map((d) => ({
      donorId: d.donorId,
      donorName: d.donorName,
      reasons: d.attentionReasons,
      monthlyValueCents: d.monthlyValueCents,
      nextBillingDate: d.nextBillingDate,
      lastFailureDate: d.lastFailureDate,
      recommendedAction: d.attentionReasons.some((r) => r.includes("payment method"))
        ? "Send Payment Update Link"
        : d.pastDueSubscriptionCount > 0
          ? "Review Failed Payment"
          : "Contact Donor",
    }));

  return {
    summary: {
      activeRecurringDonors: activeDonors.length,
      monthlyRecurringValueCents,
      annualizedRecurringValueCents,
      newRecurringDonors,
      pausedRecurringDonors: pausedDonors,
      pastDueRecurringDonors: pastDueDonors,
      canceledRecurringDonors: canceledDonors,
      failedRecurringPayments,
      donorsRequiringAttention,
      upcomingCharges7Days: { count: upcoming7.length, amountCents: upcoming7.reduce((s, x) => s + (x.amountCents ?? 0), 0) },
      upcomingCharges30Days: { count: upcoming30.length, amountCents: upcoming30.reduce((s, x) => s + (x.amountCents ?? 0), 0) },
      lifetimeRecurringDonatedCents,
      unlinkedActiveSubscriptions: activeSubs.filter((s) => !s.donorId).length,
    },
    frequencyMix: [...frequencyMix.entries()].map(([label, v]) => ({
      frequency: label,
      subscriptionCount: v.subscriptionCount,
      donorCount: v.donorIds.size,
      monthlyValueCents: v.monthlyValueCents,
    })),
    statusBreakdown,
    paymentPerformance: { succeeded, failed, pending, refunded, achReturned, disputed },
    attentionList,
    candidateCapReached: subscriptions.length >= 2000,
  };
}
