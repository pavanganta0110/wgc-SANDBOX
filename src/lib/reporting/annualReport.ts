/**
 * Annual Giving Report — wraps queryDonorReport with dateRange forced to a
 * calendar year, so it draws on the exact same eligibility rules
 * (donorAggregates' finixTransferEligibilityWhere/externalDonationEligibilityWhere,
 * the same refund/return netting) as every other Reporting view AND as
 * Annual Statements (yearEndStatements.ts computeYearEndStatement), which
 * consult the same underlying tables and the same "successful transfer
 * minus refunds minus returns" rule. This is not a byte-for-byte call into
 * computeYearEndStatement (that function is single-donor, not batch-shaped,
 * so calling it per donor here would reintroduce the N+1 problem it exists
 * to avoid at the per-statement level) — see the final report's "remaining
 * issues" for the one edge case this can diverge on (goods-and-services
 * fair-market-value deductions, which only the statement PDF itself needs).
 */
import type { MerchantAuthContext } from "@/lib/auth/requireMerchantSession";
import { queryDonorReport } from "./donorReport";
import type { ReportDefinition } from "./types";

export async function queryAnnualGivingReport(auth: MerchantAuthContext, year: number, def: Omit<ReportDefinition, "dateRange" | "reportType">) {
  const fullDef: ReportDefinition = {
    ...def,
    reportType: "ANNUAL",
    dateRange: { key: "year", year },
  };
  return queryDonorReport(auth, fullDef);
}
