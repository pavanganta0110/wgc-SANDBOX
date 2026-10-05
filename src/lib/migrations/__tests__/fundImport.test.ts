import { describe, it, expect } from "vitest";
import { suggestFundColumnMapping, mapFundRow, validateFundRow } from "@/lib/migrations/fundImport";

describe("suggestFundColumnMapping", () => {
  it("maps common header aliases to canonical fields", () => {
    const mapping = suggestFundColumnMapping(["Fund Name", "Description", "Active"]);
    expect(mapping).toEqual({ "Fund Name": "name", Description: "description", Active: "isActive" });
  });

  it("maps unrecognized headers to null", () => {
    expect(suggestFundColumnMapping(["Some Random Column"])).toEqual({ "Some Random Column": null });
  });
});

describe("mapFundRow / validateFundRow", () => {
  const headers = ["Fund Name", "Description", "Active"];
  const mapping = suggestFundColumnMapping(headers);

  it("requires a fund name", () => {
    const mapped = mapFundRow(headers, ["", "General operations", "yes"], mapping);
    const validation = validateFundRow(mapped);
    expect(validation.errors).toContain("Missing fund name");
  });

  it("defaults isActive to true when omitted", () => {
    const mapped = mapFundRow(headers, ["Building Fund", "", ""], mapping);
    const validation = validateFundRow(mapped);
    expect(validation.errors).toEqual([]);
    expect(validation.isActive).toBe(true);
  });

  it("parses 'no' as inactive", () => {
    const mapped = mapFundRow(headers, ["Old Fund", "", "no"], mapping);
    const validation = validateFundRow(mapped);
    expect(validation.isActive).toBe(false);
  });

  it("rejects an unrecognized active value", () => {
    const mapped = mapFundRow(headers, ["Fund X", "", "maybe"], mapping);
    const validation = validateFundRow(mapped);
    expect(validation.errors).toContain('Invalid value for "Active" — use yes or no');
  });
});
