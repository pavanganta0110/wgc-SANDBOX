import { describe, it, expect } from "vitest";
import { summarizeSavedReportConfig } from "../savedReportSummary";

describe("summarizeSavedReportConfig", () => {
  it("returns nothing for missing or malformed configuration", () => {
    expect(summarizeSavedReportConfig(null)).toEqual([]);
    expect(summarizeSavedReportConfig("nope")).toEqual([]);
    expect(summarizeSavedReportConfig([])).toEqual([]);
    expect(summarizeSavedReportConfig({})).toEqual([]);
  });

  it("describes the date range, amount basis, segment, search and amount filters", () => {
    expect(
      summarizeSavedReportConfig({
        dateRange: { key: "year", year: 2025 },
        amountCalculation: "NET",
        filters: {
          segment: "LAPSED",
          segmentParams: { lapsedDays: 90 },
          search: "smith",
          minAmountCents: 5000,
          maxAmountCents: 100000,
        },
        sources: { card: true, ach: false, external: false },
      }),
    ).toEqual([
      "2025",
      "Net giving",
      "Lapsed donors",
      "Lapsed 90+ days",
      "Search “smith”",
      "$50–$1,000",
      "2 sources excluded",
    ]);
  });

  it("handles preset and custom ranges and ignores unknown keys", () => {
    expect(summarizeSavedReportConfig({ dateRange: { key: "ytd" } })).toEqual([
      "Year to date",
    ]);
    expect(
      summarizeSavedReportConfig({
        dateRange: { key: "custom", from: "2026-01-01", to: "2026-03-31" },
      }),
    ).toEqual(["2026-01-01 to 2026-03-31"]);
    expect(
      summarizeSavedReportConfig({ dateRange: { key: "mystery" } }),
    ).toEqual([]);
  });
});
