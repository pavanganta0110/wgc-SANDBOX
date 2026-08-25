/**
 * Recurring Giving Report — a thin wrapper around the already-complete
 * recurring-donor engine in src/lib/subscriptions/. Per item 11's explicit
 * instruction, this does NOT re-query FinixSubscription or duplicate the
 * subscription data model — loadRecurringDonorsList already does exactly
 * what this report needs (status/frequency/fund/giving-link filters,
 * search, monthly-value min/max, sorting, pagination, tenant scoping).
 */
import type { MerchantAuthContext } from "@/lib/auth/requireMerchantSession";
import { resolveViewScope } from "@/lib/auth/viewScope";
import { resolveScopedUserId } from "@/lib/auth/scopes";
import { loadRecurringDonorsList, type RecurringDonorsListFilters, type RecurringDonorsSortKey } from "@/lib/subscriptions/recurringDonorsList";
import type { ReportDefinition } from "./types";

export async function queryRecurringReport(auth: MerchantAuthContext, def: ReportDefinition) {
  const viewScope = await resolveViewScope(auth);
  const scopedUserId = resolveScopedUserId(auth, viewScope);

  const filters: RecurringDonorsListFilters = {
    search: def.filters.search,
    status: def.filters.recurringStatus?.[0],
    fundId: def.filters.fundIds?.[0],
    givingLinkId: def.filters.givingLinkIds?.[0],
    minMonthlyValueCents: def.filters.minAmountCents,
    maxMonthlyValueCents: def.filters.maxAmountCents,
    attributedUserId: def.filters.attributedUserId ?? scopedUserId ?? undefined,
  };

  const sortKey: RecurringDonorsSortKey =
    def.sortBy === "AMOUNT" ? "monthlyValue" : def.sortBy === "DATE" ? "nextBillingDate" : def.sortBy === "LIFETIME_GIVING" ? "lifetimeDonated" : "donorName";

  return loadRecurringDonorsList(auth.churchId, filters, { key: sortKey, dir: def.sortDirection }, def.page, def.pageSize);
}
