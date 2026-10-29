import { describe, it, expect } from "vitest";
import { cleanSalutation, SALUTATION_MAX_LENGTH } from "../salutation";

describe("cleanSalutation", () => {
  it("trims and collapses whitespace", () => {
    expect(cleanSalutation("  Mr.   and  Mrs. ")).toBe("Mr. and Mrs.");
  });

  it("returns null for empty, blank and non-string input", () => {
    expect(cleanSalutation("")).toBeNull();
    expect(cleanSalutation("   ")).toBeNull();
    expect(cleanSalutation(undefined)).toBeNull();
    expect(cleanSalutation(null)).toBeNull();
    expect(cleanSalutation(42)).toBeNull();
    expect(cleanSalutation({ x: 1 })).toBeNull();
  });

  it("drops control characters", () => {
    expect(cleanSalutation("Dr.\n\t Smith\u0000")).toBe("Dr. Smith");
  });

  it("cuts to the maximum length without leaving trailing space", () => {
    const result = cleanSalutation("A".repeat(SALUTATION_MAX_LENGTH - 1) + " " + "B".repeat(20));
    expect(result).not.toBeNull();
    expect(result!.length).toBeLessThanOrEqual(SALUTATION_MAX_LENGTH);
    expect(result!.endsWith(" ")).toBe(false);
  });
});
