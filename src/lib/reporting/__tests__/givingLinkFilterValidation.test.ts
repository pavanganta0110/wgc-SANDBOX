import { describe, it, expect } from "vitest";
import { parseReportDefinition } from "../validation";
import { DEFAULT_SOURCE_TOGGLES } from "../types";

const base = {
  reportType: "DONORS",
  dateRange: { key: "all" },
  sources: DEFAULT_SOURCE_TOGGLES,
  amountCalculation: "NET",
  columns: ["donorName", "givingPage"],
  filters: {},
  sortBy: "DATE",
  sortDirection: "desc",
  page: 1,
  pageSize: 50,
};

describe("report definition giving-link filter", () => {
  it("accepts a list of giving link ids", () => {
    const def = parseReportDefinition({ ...base, filters: { givingLinkIds: ["a", "b"] } });
    expect(def.filters.givingLinkIds).toEqual(["a", "b"]);
  });
  it("rejects empty ids", () => {
    expect(() => parseReportDefinition({ ...base, filters: { givingLinkIds: [""] } })).toThrow();
  });
});
