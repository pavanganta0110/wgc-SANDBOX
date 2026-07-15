import { loadSubscriptionCandidates, type SubscriptionRow } from "@/lib/subscriptions/subscriptionAggregates";
import type { SubscriptionDisplayStatus } from "@/lib/subscriptions/subscriptionStatus";

export interface SubscriptionsListFilters {
  search?: string;
  status?: SubscriptionDisplayStatus;
  frequency?: string;
  givingLinkId?: string;
  fundId?: string;
  minAmountCents?: number;
  maxAmountCents?: number;
  minMonthlyValueCents?: number;
  maxMonthlyValueCents?: number;
  hasFailedPayment?: boolean;
  hasPastDue?: boolean;
  requiresAttention?: boolean;
  createdDateFilter?: { gte: Date; lte?: Date };
  startDateFilter?: { gte: Date; lte?: Date };
  nextBillingDateFilter?: { gte: Date; lte?: Date };
}

export type SubscriptionsSortKey = "amount" | "monthlyValue" | "nextBillingDate" | "startDate" | "createdAt" | "donorName" | "lifetimeCollected";

export interface SubscriptionsListResult {
  rows: SubscriptionRow[];
  totalCount: number;
  candidateCapReached: boolean;
}

/** Schedule-centric list — every subscription appears as its own row, never grouped by donor (unlike Recurring Donors). */
export async function loadSubscriptionsList(
  churchId: string,
  filters: SubscriptionsListFilters,
  sort: { key: SubscriptionsSortKey; dir: "asc" | "desc" },
  page: number,
  pageSize: number,
): Promise<SubscriptionsListResult> {
  const all = await loadSubscriptionCandidates(churchId);
  let rows = all;

  if (filters.search) {
    const q = filters.search.toLowerCase();
    rows = rows.filter(
      (s) =>
        s.donorName.toLowerCase().includes(q) ||
        (s.donorEmail || "").toLowerCase().includes(q) ||
        s.finixSubscriptionId.toLowerCase().includes(q) ||
        (s.paymentMethod?.last4 || "").includes(q),
    );
  }
  if (filters.status) rows = rows.filter((s) => s.displayStatus === filters.status);
  if (filters.frequency) rows = rows.filter((s) => (s.billingInterval || "").toUpperCase() === filters.frequency!.toUpperCase());
  if (filters.givingLinkId) rows = rows.filter((s) => s.givingLinkId === filters.givingLinkId);
  if (filters.fundId) rows = rows.filter((s) => s.fundId === filters.fundId);
  if (filters.minAmountCents != null) rows = rows.filter((s) => s.amountCents >= filters.minAmountCents!);
  if (filters.maxAmountCents != null) rows = rows.filter((s) => s.amountCents <= filters.maxAmountCents!);
  if (filters.minMonthlyValueCents != null) rows = rows.filter((s) => s.monthlyValueCents >= filters.minMonthlyValueCents!);
  if (filters.maxMonthlyValueCents != null) rows = rows.filter((s) => s.monthlyValueCents <= filters.maxMonthlyValueCents!);
  if (filters.hasFailedPayment) rows = rows.filter((s) => s.failedAttempts > 0);
  if (filters.hasPastDue) rows = rows.filter((s) => s.displayStatus === "PAST_DUE");
  if (filters.requiresAttention) rows = rows.filter((s) => s.requiresAttention);
  if (filters.createdDateFilter) rows = rows.filter((s) => s.createdAt >= filters.createdDateFilter!.gte && (!filters.createdDateFilter!.lte || s.createdAt <= filters.createdDateFilter!.lte));
  if (filters.startDateFilter) rows = rows.filter((s) => s.startDate && s.startDate >= filters.startDateFilter!.gte && (!filters.startDateFilter!.lte || s.startDate <= filters.startDateFilter!.lte));
  if (filters.nextBillingDateFilter) rows = rows.filter((s) => s.nextBillingDate && s.nextBillingDate >= filters.nextBillingDateFilter!.gte && (!filters.nextBillingDateFilter!.lte || s.nextBillingDate <= filters.nextBillingDateFilter!.lte));

  const sortValue = (s: SubscriptionRow): number | string => {
    switch (sort.key) {
      case "amount":
        return s.amountCents;
      case "monthlyValue":
        return s.monthlyValueCents;
      case "nextBillingDate":
        return s.nextBillingDate?.getTime() ?? Infinity;
      case "startDate":
        return s.startDate?.getTime() ?? Infinity;
      case "createdAt":
        return s.createdAt.getTime();
      case "donorName":
        return s.donorName.toLowerCase();
      case "lifetimeCollected":
        return s.lifetimeCollectedCents;
      default:
        return 0;
    }
  };
  rows = [...rows].sort((a, b) => {
    const av = sortValue(a);
    const bv = sortValue(b);
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sort.dir === "asc" ? cmp : -cmp;
  });

  const totalCount = rows.length;
  const paged = rows.slice((page - 1) * pageSize, page * pageSize);

  return { rows: paged, totalCount, candidateCapReached: all.length >= 2000 };
}
