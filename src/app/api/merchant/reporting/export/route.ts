import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { parseReportDefinition, ReportValidationError } from "@/lib/reporting/validation";
import { queryDonorReport } from "@/lib/reporting/donorReport";
import { queryAnnualGivingReport } from "@/lib/reporting/annualReport";
import { queryLapsedDonorReport } from "@/lib/reporting/lapsedReport";
import { queryRecurringReport } from "@/lib/reporting/recurringReport";
import {
  donorReportCsvResponse,
  buildDonorReportWorkbook,
  recurringReportCsvResponse,
  buildRecurringReportWorkbook,
  excelResponse,
  organizationFilenameSlug,
} from "@/lib/reporting/export";
import { rangeLabel } from "@/lib/dateRangePresets";
import { MAX_EXPORT_ROWS, type ReportDefinition, type DonorReportRow } from "@/lib/reporting/types";
import type { RecurringDonorRow } from "@/lib/subscriptions/subscriptionAggregates";

/**
 * Export never accepts a churchId/merchantId from the browser (item 17) —
 * auth.churchId, resolved server-side from the session, is the only source
 * used anywhere in this route or the engines it calls. Format (csv|xlsx)
 * is validated against a fixed allowlist, not passed through to any
 * filesystem/shell operation.
 */
export async function POST(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canExportReports");
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  let body: { format?: string; definition?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const format = body.format === "xlsx" ? "xlsx" : body.format === "csv" ? "csv" : null;
  if (!format) return NextResponse.json({ error: "format must be 'csv' or 'xlsx'." }, { status: 400 });

  let def: ReportDefinition;
  try {
    // Validate with an interactive-sized page (the schema caps pageSize at
    // MAX_PAGE_SIZE), then widen it: an export is one page of every row, up
    // to MAX_EXPORT_ROWS. Validating with MAX_EXPORT_ROWS directly always
    // failed with "pageSize: Too big".
    def = { ...parseReportDefinition({ ...(body.definition as object), page: 1, pageSize: 1 }), page: 1, pageSize: MAX_EXPORT_ROWS };
  } catch (err) {
    if (err instanceof ReportValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }

  const dateRangeLabel = rangeLabel(def.dateRange.key === "year" ? "custom" : def.dateRange.key, def.dateRange.from, def.dateRange.to) || `Year ${def.dateRange.year}`;
  const timestamp = new Date().toISOString().slice(0, 10);
  // Named after the organization, not WGC — the file is the merchant's own record.
  const church = await prisma.church.findUnique({ where: { id: auth.churchId }, select: { name: true, statementSenderName: true } });
  const organizationName = church?.statementSenderName || church?.name || undefined;
  const baseFilename = `${organizationFilenameSlug(organizationName)}-${def.reportType.toLowerCase()}-report-${timestamp}`;

  if (def.reportType === "RECURRING") {
    let recurringResult: { rows: RecurringDonorRow[]; totalCount: number };
    try {
      recurringResult = await queryRecurringReport(auth, def);
    } catch (err) {
      console.error("Reporting export failed:", err);
      return NextResponse.json({ error: "Failed to generate export. Please try again." }, { status: 500 });
    }
    if (format === "csv") return recurringReportCsvResponse(recurringResult.rows, `${baseFilename}.csv`);
    const buffer = await buildRecurringReportWorkbook({
      rows: recurringResult.rows,
      organizationName,
      dateRangeLabel,
      generatedAt: new Date(),
      totalRowsAvailable: recurringResult.totalCount,
    });
    return excelResponse(buffer, `${baseFilename}.xlsx`);
  }

  // Every donor export says which giving link the donor gave through (their
  // most recent one), even when the on-screen table doesn't show that column.
  if (!def.columns.includes("givingPage")) def = { ...def, columns: [...def.columns, "givingPage"] };

  let result: { rows: DonorReportRow[]; totalCount: number };
  try {
    if (def.reportType === "LAPSED") {
      const lapsedDays = def.filters.segmentParams?.lapsedDays ?? 90;
      result = await queryLapsedDonorReport(auth, lapsedDays, def);
    } else if (def.reportType === "ANNUAL") {
      const year = def.dateRange.year ?? new Date().getFullYear();
      result = await queryAnnualGivingReport(auth, year, def);
    } else {
      result = await queryDonorReport(auth, def);
    }
  } catch (err) {
    console.error("Reporting export failed:", err);
    return NextResponse.json({ error: "Failed to generate export. Please try again." }, { status: 500 });
  }

  if (format === "csv") {
    return donorReportCsvResponse(result.rows, def.columns, `${baseFilename}.csv`);
  }

  const buffer = await buildDonorReportWorkbook({
    rows: result.rows,
    columns: def.columns,
    reportName: reportTypeLabel(def.reportType),
    organizationName,
    dateRangeLabel,
    generatedAt: new Date(),
    totalRowsAvailable: result.totalCount,
  });
  return excelResponse(buffer, `${baseFilename}.xlsx`);
}

function reportTypeLabel(reportType: ReportDefinition["reportType"]): string {
  switch (reportType) {
    case "DONORS":
      return "Donor Report";
    case "ANNUAL":
      return "Annual Giving Report";
    case "RECURRING":
      return "Recurring Giving Report";
    case "LAPSED":
      return "Lapsed Donor Report";
    default:
      return "Report";
  }
}
