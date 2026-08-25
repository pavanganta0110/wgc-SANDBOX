import ExcelJS from "exceljs";
import { buildCsvExport, csvResponse, sanitizeCsvFormulaValue, type CsvColumn } from "@/lib/csvExport";
import { formatCents } from "@/lib/format";
import { formatCalendarDateUTC } from "@/lib/formatDateTimeCDT";
import type { RecurringDonorRow } from "@/lib/subscriptions/subscriptionAggregates";
import type { DonorReportRow, DonorReportColumn } from "./types";
import { DONOR_COLUMN_LABELS, formatDonorColumnValue, rawDonorColumnValue, isDonorColumnCurrency, isDonorColumnDate } from "./exportColumns";

export function donorReportCsv(rows: DonorReportRow[], columns: DonorReportColumn[]): string {
  const csvColumns: CsvColumn<DonorReportRow>[] = columns.map((col) => ({
    header: DONOR_COLUMN_LABELS[col],
    value: (row) => sanitizeCsvFormulaValue(formatDonorColumnValue(row, col)),
  }));
  return buildCsvExport(rows, csvColumns);
}

export function donorReportCsvResponse(rows: DonorReportRow[], columns: DonorReportColumn[], filename: string): Response {
  return csvResponse(donorReportCsv(rows, columns), filename);
}

/**
 * Excel export — Summary + Donors sheets for a standard donor report; the
 * caller may add further sheets (Recurring, External Gifts, Funds) only
 * when relevant to the selected report type (item 16: "only include sheets
 * relevant to the selected report").
 */
export async function buildDonorReportWorkbook(params: {
  rows: DonorReportRow[];
  columns: DonorReportColumn[];
  reportName: string;
  dateRangeLabel: string;
  generatedAt: Date;
  totalRowsAvailable: number;
}): Promise<ExcelJS.Buffer> {
  const { rows, columns, reportName, dateRangeLabel, generatedAt, totalRowsAvailable } = params;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "WGC Payments";
  workbook.created = generatedAt;

  const summary = workbook.addWorksheet("Summary");
  summary.columns = [{ width: 28 }, { width: 40 }];
  summary.addRow(["Report", reportName]);
  summary.addRow(["Date Range", dateRangeLabel]);
  summary.addRow(["Generated", generatedAt.toLocaleString("en-US")]);
  summary.addRow(["Rows in Export", rows.length]);
  if (totalRowsAvailable > rows.length) {
    summary.addRow(["Note", `This report matched ${totalRowsAvailable} donors; the export is capped at ${rows.length} rows.`]);
  }
  summary.getRow(1).font = { bold: true };
  for (let i = 1; i <= 4; i++) summary.getCell(i, 1).font = { bold: true };

  const sheet = workbook.addWorksheet("Donors", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = columns.map((col) => ({
    header: DONOR_COLUMN_LABELS[col],
    key: col,
    width: Math.max(DONOR_COLUMN_LABELS[col].length + 2, 14),
  }));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };

  for (const row of rows) {
    const values: Record<string, string | number | boolean | Date | null> = {};
    for (const col of columns) values[col] = rawDonorColumnValue(row, col);
    sheet.addRow(values);
  }

  for (const col of columns) {
    if (isDonorColumnCurrency(col)) sheet.getColumn(col).numFmt = '"$"#,##0.00';
    if (isDonorColumnDate(col)) sheet.getColumn(col).numFmt = "mm/dd/yyyy";
  }

  return workbook.xlsx.writeBuffer();
}

/**
 * Recurring Giving Report export — RecurringDonorRow has its own shape
 * (one row per donor's subscription bundle, not the donor-report columns),
 * so it gets its own CSV/Excel builders rather than being forced through
 * the generic donor-column export (previously a flagged gap).
 */
const RECURRING_COLUMNS: { header: string; value: (r: RecurringDonorRow) => string }[] = [
  { header: "Donor Name", value: (r) => r.donorName },
  { header: "Email", value: (r) => r.donorEmail || "" },
  { header: "Phone", value: (r) => r.donorPhone || "" },
  { header: "Status", value: (r) => r.overallStatus },
  { header: "Monthly Value", value: (r) => formatCents(r.monthlyValueCents) },
  { header: "Annualized Value", value: (r) => formatCents(r.annualizedValueCents) },
  { header: "Active Subscriptions", value: (r) => String(r.activeSubscriptionCount) },
  { header: "Frequencies", value: (r) => r.frequencies.join(", ") },
  { header: "Next Billing Date", value: (r) => formatCalendarDateUTC(r.nextBillingDate) },
  { header: "Failed Payment Count", value: (r) => String(r.failedPaymentCount) },
  { header: "Lifetime Recurring Given", value: (r) => formatCents(r.lifetimeRecurringDonatedCents) },
  { header: "Giving Link", value: (r) => r.givingLinkName || "" },
];

export function recurringReportCsv(rows: RecurringDonorRow[]): string {
  const csvColumns: CsvColumn<RecurringDonorRow>[] = RECURRING_COLUMNS.map((c) => ({
    header: c.header,
    value: (row) => sanitizeCsvFormulaValue(c.value(row)),
  }));
  return buildCsvExport(rows, csvColumns);
}

export function recurringReportCsvResponse(rows: RecurringDonorRow[], filename: string): Response {
  return csvResponse(recurringReportCsv(rows), filename);
}

export async function buildRecurringReportWorkbook(params: {
  rows: RecurringDonorRow[];
  dateRangeLabel: string;
  generatedAt: Date;
  totalRowsAvailable: number;
}): Promise<ExcelJS.Buffer> {
  const { rows, dateRangeLabel, generatedAt, totalRowsAvailable } = params;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "WGC Payments";
  workbook.created = generatedAt;

  const summary = workbook.addWorksheet("Summary");
  summary.columns = [{ width: 28 }, { width: 40 }];
  summary.addRow(["Report", "Recurring Giving Report"]);
  summary.addRow(["Date Range", dateRangeLabel]);
  summary.addRow(["Generated", generatedAt.toLocaleString("en-US")]);
  summary.addRow(["Rows in Export", rows.length]);
  if (totalRowsAvailable > rows.length) {
    summary.addRow(["Note", `This report matched ${totalRowsAvailable} recurring donors; the export is capped at ${rows.length} rows.`]);
  }
  summary.getRow(1).font = { bold: true };
  for (let i = 1; i <= 4; i++) summary.getCell(i, 1).font = { bold: true };

  const sheet = workbook.addWorksheet("Recurring Donors", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = RECURRING_COLUMNS.map((c) => ({ header: c.header, key: c.header, width: Math.max(c.header.length + 2, 14) }));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };

  for (const row of rows) {
    const values: Record<string, string | number> = {};
    for (const c of RECURRING_COLUMNS) values[c.header] = c.value(row);
    sheet.addRow(values);
  }

  return workbook.xlsx.writeBuffer();
}

export function excelResponse(buffer: ExcelJS.Buffer, filename: string): Response {
  return new Response(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
