import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { parseReportDefinition, ReportValidationError } from "@/lib/reporting/validation";
import { queryDonorReport } from "@/lib/reporting/donorReport";
import { queryAnnualGivingReport } from "@/lib/reporting/annualReport";
import { queryRecurringReport } from "@/lib/reporting/recurringReport";
import { queryLapsedDonorReport } from "@/lib/reporting/lapsedReport";

/**
 * The single query endpoint powering every interactive report table (item
 * 33) — reportType selects which engine module runs, but auth, scope
 * resolution, and result shape all go through the same path here. The
 * merchant/organization is ALWAYS resolved from the authenticated session
 * (auth.churchId) — the request body is never trusted for it (item 33/17).
 */
export async function POST(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canViewDonors");
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  let def;
  try {
    def = parseReportDefinition(body);
  } catch (err) {
    if (err instanceof ReportValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }

  try {
    switch (def.reportType) {
      case "RECURRING": {
        const result = await queryRecurringReport(auth, def);
        return NextResponse.json(result);
      }
      case "LAPSED": {
        const lapsedDays = def.filters.segmentParams?.lapsedDays ?? 90;
        const result = await queryLapsedDonorReport(auth, lapsedDays, def);
        return NextResponse.json(result);
      }
      case "ANNUAL": {
        const year = def.dateRange.year ?? new Date().getFullYear();
        const result = await queryAnnualGivingReport(auth, year, def);
        return NextResponse.json(result);
      }
      case "DONORS":
      case "GIVING":
      case "FUND_CAMPAIGN":
      case "YEAR_OVER_YEAR":
      default: {
        const result = await queryDonorReport(auth, def);
        return NextResponse.json(result);
      }
    }
  } catch (err) {
    console.error("Reporting query failed:", err);
    return NextResponse.json({ error: "Failed to generate report. Please try again." }, { status: 500 });
  }
}
