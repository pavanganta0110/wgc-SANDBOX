import { describe, it, expect } from "vitest";
import { sanitizeCsvFormulaValue } from "@/lib/csvExport";

describe("sanitizeCsvFormulaValue", () => {
  it("prefixes values starting with =, +, -, or @ with a leading apostrophe", () => {
    expect(sanitizeCsvFormulaValue("=SUM(A1:A10)")).toBe("'=SUM(A1:A10)");
    expect(sanitizeCsvFormulaValue("+1234567890")).toBe("'+1234567890");
    expect(sanitizeCsvFormulaValue("-1234567890")).toBe("'-1234567890");
    expect(sanitizeCsvFormulaValue("@SUM(A1)")).toBe("'@SUM(A1)");
  });

  it("leaves ordinary values untouched", () => {
    expect(sanitizeCsvFormulaValue("John Doe")).toBe("John Doe");
    expect(sanitizeCsvFormulaValue("100.00")).toBe("100.00");
    expect(sanitizeCsvFormulaValue("")).toBe("");
  });

  it("does not treat a formula-trigger character in the middle of a string as dangerous", () => {
    expect(sanitizeCsvFormulaValue("Gift Fund =2026")).toBe("Gift Fund =2026");
  });
});
