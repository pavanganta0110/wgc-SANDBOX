import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { buildYearTotalsWorkbook, type YearTotalRow } from "@/lib/donors/annualTotals";

const row = (over: Partial<YearTotalRow> = {}): YearTotalRow => ({
  donorId: "d1", name: "Pat Lee", email: "pat@example.com", addressLine1: "12 Main St", addressLine2: null, city: "Boston", state: "MA",
  postalCode: "02108", country: "US", addressStatus: "CONFIRMED", donationCount: 3, totalCents: 125050, ...over,
});

async function read(rows: YearTotalRow[]) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await buildYearTotalsWorkbook(rows, 2025)) as unknown as ExcelJS.Buffer);
  return wb.worksheets[0];
}

describe("buildYearTotalsWorkbook", () => {
  it("writes a real workbook with name, mailing address, email and the total as a number", async () => {
    const sheet = await read([row(), row({ donorId: "d2", name: "Sam Ortiz", totalCents: 5000, donationCount: 1 })]);
    expect(sheet.name).toBe("2025 Giving");
    expect(sheet.getRow(1).values).toEqual(expect.arrayContaining(["Donor Name", "Address Line 1", "City", "State", "ZIP", "Email", "Total Given"]));
    const pat = sheet.getRow(2);
    expect(pat.getCell("A").value).toBe("Pat Lee");
    expect(pat.getCell("J").value).toBe(1250.5);
    expect(typeof pat.getCell("J").value).toBe("number");
  });

  it("keeps ZIP codes with leading zeros as text", async () => {
    const sheet = await read([row()]);
    expect(sheet.getRow(2).getCell("F").value).toBe("02108");
  });

  it("adds a Total row that sums gifts and dollars", async () => {
    const sheet = await read([row(), row({ donorId: "d2", name: "Sam", totalCents: 5000, donationCount: 1 })]);
    const total = sheet.getRow(4);
    expect(total.getCell("A").value).toBe("Total");
    expect(total.getCell("I").value).toBe(4);
    expect(total.getCell("J").value).toBe(1300.5);
  });

  it("stores donor-entered text as plain text, never a formula", async () => {
    const sheet = await read([row({ name: "=HYPERLINK(\"http://evil\")" })]);
    const cell = sheet.getRow(2).getCell("A");
    expect(cell.type).toBe(ExcelJS.ValueType.String);
    expect(cell.formula).toBeUndefined();
  });
});
