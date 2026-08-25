import { describe, it, expect } from "vitest";
import { parseReportDefinition, ReportValidationError } from "../validation";

const baseValid = {
  reportType: "DONORS",
  dateRange: { key: "ytd" },
  sources: { card: true, ach: true, external: true, cash: true, check: true, inKind: true, recurring: true, oneTime: true, refunded: true, achReturns: false, failedPayments: false, anonymous: true },
  amountCalculation: "NET",
  columns: ["donorName", "email"],
  filters: {},
  sortBy: "DATE",
  sortDirection: "desc",
  page: 1,
  pageSize: 50,
};

describe("parseReportDefinition", () => {
  it("accepts a valid definition", () => {
    expect(() => parseReportDefinition(baseValid)).not.toThrow();
  });

  it("rejects an arbitrary reportType not in the allowlist — never trusts a raw client string", () => {
    expect(() => parseReportDefinition({ ...baseValid, reportType: "DROP TABLE donors" })).toThrow(ReportValidationError);
  });

  it("rejects an arbitrary column name not in DONOR_REPORT_COLUMNS", () => {
    expect(() => parseReportDefinition({ ...baseValid, columns: ["donorName", "internalPasswordHash"] })).toThrow(ReportValidationError);
  });

  it("rejects a custom date range missing from/to", () => {
    expect(() => parseReportDefinition({ ...baseValid, dateRange: { key: "custom" } })).toThrow(ReportValidationError);
  });

  it("rejects a year date range missing year", () => {
    expect(() => parseReportDefinition({ ...baseValid, dateRange: { key: "year" } })).toThrow(ReportValidationError);
  });

  it("accepts a year date range with a future year — never a hardcoded allowlist of years", () => {
    expect(() => parseReportDefinition({ ...baseValid, dateRange: { key: "year", year: 2031 } })).not.toThrow();
  });

  it("rejects a pageSize above MAX_PAGE_SIZE", () => {
    expect(() => parseReportDefinition({ ...baseValid, pageSize: 100000 })).toThrow(ReportValidationError);
  });

  it("rejects an unrecognized segment key", () => {
    expect(() => parseReportDefinition({ ...baseValid, filters: { segment: "VIP_SECRET_LIST" } })).toThrow(ReportValidationError);
  });

  it("rejects a missing sources object entirely", () => {
    const { sources: _omit, ...rest } = baseValid;
    expect(() => parseReportDefinition(rest)).toThrow(ReportValidationError);
  });
});
