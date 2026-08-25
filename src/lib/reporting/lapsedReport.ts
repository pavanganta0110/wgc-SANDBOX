/**
 * Lapsed Donor Report — donors with real giving history who haven't given
 * within a configurable window. Wraps queryDonorReport with the LAPSED
 * segment and an all-time date range (a donor's "last donation" must be
 * found across their whole history, not just within some other filtered
 * window). Follow-up/contact is explicitly out of scope here (item 10) —
 * this only classifies and lists, it never sends anything.
 */
import type { MerchantAuthContext } from "@/lib/auth/requireMerchantSession";
import { queryDonorReport } from "./donorReport";
import type { ReportDefinition } from "./types";

export async function queryLapsedDonorReport(auth: MerchantAuthContext, lapsedDays: number, def: Omit<ReportDefinition, "dateRange" | "reportType" | "filters">) {
  const fullDef: ReportDefinition = {
    ...def,
    reportType: "LAPSED",
    dateRange: { key: "all" },
    filters: { segment: "LAPSED", segmentParams: { lapsedDays } },
  };
  return queryDonorReport(auth, fullDef);
}
