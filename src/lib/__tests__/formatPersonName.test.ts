import { describe, it, expect } from "vitest";
import { formatPersonName } from "@/lib/formatPersonName";

describe("formatPersonName", () => {
  it("dedupes identical first/last words (e.g. 'John John')", () => {
    expect(formatPersonName("John John")).toBe("John");
  });

  it("filters the 'unknown' placeholder word confirmed present in real donor data", () => {
    expect(formatPersonName("Yuva Unknown")).toBe("Yuva");
    expect(formatPersonName("Unknown")).toBe("—");
  });

  it("filters nan/undefined/null placeholder tokens", () => {
    expect(formatPersonName("nan")).toBe("—");
    expect(formatPersonName("undefined")).toBe("—");
    expect(formatPersonName("null")).toBe("—");
  });

  it("trims whitespace and collapses repeated internal spaces", () => {
    expect(formatPersonName("  Maria   Johnson  ")).toBe("Maria Johnson");
  });

  it("falls back to the cardholder/account-holder name only when no donor name exists", () => {
    expect(formatPersonName(null, "Card Holder")).toBe("Card Holder");
    expect(formatPersonName("", "Card Holder")).toBe("Card Holder");
  });

  it("prefers the donor identity name over the cardholder fallback when both exist", () => {
    expect(formatPersonName("Real Donor", "Card Holder")).toBe("Real Donor");
  });

  it("returns an em dash when no valid name exists anywhere", () => {
    expect(formatPersonName(null)).toBe("—");
    expect(formatPersonName("nan", "undefined")).toBe("—");
  });
});
