import { loadSubscriptionCandidates, groupSubscriptionsByDonor, type RecurringDonorRow } from "@/lib/subscriptions/subscriptionAggregates";

export interface RecurringDonorsListFilters {
  search?: string;
  status?: string;
  frequency?: string;
  givingLinkId?: string;
  fundId?: string;
  minMonthlyValueCents?: number;
  maxMonthlyValueCents?: number;
  hasFailedPayment?: boolean;
  hasPastDue?: boolean;
  requiresAttention?: boolean;
  createdDateFilter?: { gte: Date; lte?: Date };
  nextBillingDateFilter?: { gte: Date; lte?: Date };
}

export type RecurringDonorsSortKey = "monthlyValue" | "nextBillingDate" | "donorName" | "lifetimeDonated" | "createdAt";

export interface RecurringDonorsListResult {
  rows: RecurringDonorRow[];
  totalCount: number;
  candidateCapReached: boolean;
}

/** Shared filter/sort/pagination logic used both by the page (server-rendered) and the API route (external/testable). */
export async function loadRecurringDonorsList(
  churchId: string,
  filters: RecurringDonorsListFilters,
  sort: { key: RecurringDonorsSortKey; dir: "asc" | "desc" },
  page: number,
  pageSize: number,
): Promise<RecurringDonorsListResult> {
  const subscriptions = await loadSubscriptionCandidates(churchId);
  let donors = groupSubscriptionsByDonor(subscriptions);

  if (filters.search) {
    const q = filters.search.toLowerCase();
    donors = donors.filter((d) => d.donorName.toLowerCase().includes(q) || (d.donorEmail || "").toLowerCase().includes(q) || (d.donorPhone || "").toLowerCase().includes(q));
  }
  if (filters.status) donors = donors.filter((d) => d.overallStatus === filters.status);
  if (filters.frequency) donors = donors.filter((d) => d.frequencies.includes(filters.frequency!));
  if (filters.givingLinkId) donors = donors.filter((d) => subscriptions.some((s) => s.donorId === d.donorId && s.givingLinkId === filters.givingLinkId));
  if (filters.fundId) donors = donors.filter((d) => subscriptions.some((s) => s.donorId === d.donorId && s.fundId === filters.fundId));
  if (filters.minMonthlyValueCents != null) donors = donors.filter((d) => d.monthlyValueCents >= filters.minMonthlyValueCents!);
  if (filters.maxMonthlyValueCents != null) donors = donors.filter((d) => d.monthlyValueCents <= filters.maxMonthlyValueCents!);
  if (filters.hasFailedPayment) donors = donors.filter((d) => d.failedPaymentCount > 0);
  if (filters.hasPastDue) donors = donors.filter((d) => d.pastDueSubscriptionCount > 0);
  if (filters.requiresAttention) donors = donors.filter((d) => d.requiresAttention);
  if (filters.createdDateFilter) donors = donors.filter((d) => d.createdAt >= filters.createdDateFilter!.gte && (!filters.createdDateFilter!.lte || d.createdAt <= filters.createdDateFilter!.lte));
  if (filters.nextBillingDateFilter) donors = donors.filter((d) => d.nextBillingDate && d.nextBillingDate >= filters.nextBillingDateFilter!.gte && (!filters.nextBillingDateFilter!.lte || d.nextBillingDate <= filters.nextBillingDateFilter!.lte));

  const sortValue = (d: RecurringDonorRow): number | string => {
    switch (sort.key) {
      case "monthlyValue":
        return d.monthlyValueCents;
      case "nextBillingDate":
        return d.nextBillingDate?.getTime() ?? Infinity;
      case "donorName":
        return d.donorName.toLowerCase();
      case "lifetimeDonated":
        return d.lifetimeRecurringDonatedCents;
      case "createdAt":
        return d.createdAt.getTime();
      default:
        return 0;
    }
  };
  donors.sort((a, b) => {
    const av = sortValue(a);
    const bv = sortValue(b);
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sort.dir === "asc" ? cmp : -cmp;
  });

  const totalCount = donors.length;
  const rows = donors.slice((page - 1) * pageSize, page * pageSize);

  return { rows, totalCount, candidateCapReached: subscriptions.length >= 2000 };
}
