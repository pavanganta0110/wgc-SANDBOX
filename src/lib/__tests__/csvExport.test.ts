import { describe, it, expect } from "vitest";
import { sanitizeCsvFormulaValue, buildCsvExport } from "@/lib/csvExport";

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

describe("buildCsvExport — formula-injection sanitization is applied centrally", () => {
  it("neutralizes a donor-controlled cell value that starts with a formula-trigger character, even when the caller's own column definition never calls sanitizeCsvFormulaValue itself", () => {
    const rows = [{ name: "=HYPERLINK(\"https://evil.example\",\"Click me\")" }];
    const csv = buildCsvExport(rows, [{ header: "Name", value: (r) => r.name }]);
    const [, dataLine] = csv.split("\n");
    expect(dataLine).toContain("'=HYPERLINK");
  });

  it("never double-prefixes a value a caller already sanitized itself", () => {
    const rows = [{ name: "=SUM(A1)" }];
    const csv = buildCsvExport(rows, [{ header: "Name", value: (r) => sanitizeCsvFormulaValue(r.name) }]);
    const [, dataLine] = csv.split("\n");
    expect(dataLine).toBe("'=SUM(A1)");
    expect(dataLine).not.toContain("''");
  });

  it("leaves an ordinary value and the header row untouched", () => {
    const rows = [{ name: "Jane Donor" }];
    const csv = buildCsvExport(rows, [{ header: "Name", value: (r) => r.name }]);
    expect(csv).toBe("Name\nJane Donor");
  });
});
