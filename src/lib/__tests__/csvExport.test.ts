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

describe("buildCsvExport — numeric columns", () => {
  const rows = [{ amount: "-2.55", other: "-2.55" }];

  it("keeps a plain negative number as a number in an opted-in column", () => {
    const csv = buildCsvExport(rows, [{ header: "Amount", value: (r) => r.amount, numeric: true }]);
    expect(csv.split("\n")[1]).toBe("-2.55");
  });

  it("still sanitizes everything else, including non-numbers in a numeric column", () => {
    const plain = buildCsvExport(rows, [{ header: "Other", value: (r) => r.other }]);
    expect(plain.split("\n")[1]).toBe("'-2.55");
    const formula = buildCsvExport([{ v: "-1+2" }], [{ header: "V", value: (r) => r.v, numeric: true }]);
    expect(formula.split("\n")[1]).toBe("'-1+2");
  });
});
