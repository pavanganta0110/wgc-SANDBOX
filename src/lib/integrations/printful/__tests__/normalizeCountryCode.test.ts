import { describe, it, expect } from "vitest";
import { normalizeCountryCode } from "../realProvider";

describe("normalizeCountryCode", () => {
  it("converts common 3-letter/full-name US variants to the ISO alpha-2 code", () => {
    expect(normalizeCountryCode("USA")).toBe("US");
    expect(normalizeCountryCode("usa")).toBe("US");
    expect(normalizeCountryCode("United States")).toBe("US");
    expect(normalizeCountryCode("United States of America")).toBe("US");
  });

  it("passes through an already-correct 2-letter code unchanged", () => {
    expect(normalizeCountryCode("US")).toBe("US");
    expect(normalizeCountryCode("ca")).toBe("CA");
  });

  it("defaults to US when the value is empty, null, or undefined", () => {
    expect(normalizeCountryCode("")).toBe("US");
    expect(normalizeCountryCode(null)).toBe("US");
    expect(normalizeCountryCode(undefined)).toBe("US");
  });

  it("passes through an unrecognized value unchanged rather than guessing", () => {
    expect(normalizeCountryCode("Freedonia")).toBe("FREEDONIA");
  });
});
