import { describe, it, expect } from "vitest";
import { buildDepositPaymentsCsv } from "@/lib/finix/depositPaymentsCsv";
import { summarizeDepositRows, type DepositPaymentRow } from "@/lib/finix/depositPaymentRows";

function row(overrides: Partial<DepositPaymentRow> = {}): DepositPaymentRow {
  return {
    transferId: "TR_1",
    paymentId: "p1",
    settlementId: "ST_1",
    createdAt: new Date("2026-10-01T12:00:00Z"),
    payerName: "Jane Doe",
    payerEmail: "jane@example.com",
    studentNumber: "S-100",
    studentName: "Sam Doe",
    term: "Fall 2026",
    fundName: "Tuition",
    note: "apply to previous semester",
    method: "VISA",
    lastFour: "4242",
    state: "SUCCEEDED",
    grossCents: 10000,
    feeCents: 255,
    refundCents: 0,
    returnCents: 0,
    netCents: 9745,
    ...overrides,
  };
}

describe("summarizeDepositRows", () => {
  it("totals the rows and exposes what is left over as settlement-level adjustments", () => {
    const rows = [row(), row({ transferId: "TR_2", grossCents: 5000, feeCents: 140, netCents: 4860 })];
    const s = summarizeDepositRows(rows, 14555);
    expect(s.paymentCount).toBe(2);
    expect(s.grossCents).toBe(15000);
    expect(s.feeCents).toBe(395);
    expect(s.rowsNetCents).toBe(14605);
    // 14,555 paid out vs 14,605 from the rows: a 50-cent settlement fee not tied to any payment.
    expect(s.otherAdjustmentsCents).toBe(-50);
  });

  it("rows plus adjustments always equal the deposit net", () => {
    const rows = [row(), row({ transferId: "TR_2", refundCents: 2000, netCents: 7745 })];
    const s = summarizeDepositRows(rows, 17000);
    expect(s.rowsNetCents + s.otherAdjustmentsCents).toBe(s.depositNetCents);
  });
});

describe("buildDepositPaymentsCsv", () => {
  const base = { depositId: "FT_1", depositNetCents: 9695, showStudent: true, showTerm: true, paymentMode: false };

  it("writes one row per payment with plain decimal, signed amounts", () => {
    const lines = buildDepositPaymentsCsv([row()], base).split("\n");
    expect(lines[0]).toBe(
      "Deposit ID,Settlement ID,Payment ID,Date,Donor Name,Donor Email,Student ID,Student Name,Term,Fund,Note,Method,Last Four,State,Gross,Fees,Refunds,Bank Returns,Net"
    );
    expect(lines[1]).toBe(
      "FT_1,ST_1,TR_1,2026-10-01T12:00:00.000Z,Jane Doe,jane@example.com,S-100,Sam Doe,Fall 2026,Tuition,apply to previous semester,VISA,4242,SUCCEEDED,100.00,-2.55,0.00,0.00,97.45"
    );
  });

  it("adds an adjustments row and a deposit total that reconcile to the bank", () => {
    const lines = buildDepositPaymentsCsv([row()], base).split("\n");
    expect(lines[2]).toContain("Other settlement-level adjustments");
    expect(lines[2].endsWith("-0.50")).toBe(true);
    expect(lines[3]).toContain("Deposit total");
    expect(lines[3].endsWith("96.95")).toBe(true);
  });

  it("omits the adjustments row when the rows already match the deposit", () => {
    const lines = buildDepositPaymentsCsv([row()], { ...base, depositNetCents: 9745 }).split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[2]).toContain("Deposit total");
  });

  it("drops the student and term columns for orgs that use neither", () => {
    const header = buildDepositPaymentsCsv([row()], { ...base, showStudent: false, showTerm: false }).split("\n")[0];
    expect(header).not.toContain("Student");
    expect(header).not.toContain("Term");
  });

  it("keeps the Term column without the student columns for orgs using only the term field", () => {
    const header = buildDepositPaymentsCsv([row()], { ...base, showStudent: false }).split("\n")[0];
    expect(header).not.toContain("Student");
    expect(header).toContain("Term");
  });

  it("uses payer wording in payment mode", () => {
    const header = buildDepositPaymentsCsv([row()], { ...base, paymentMode: true }).split("\n")[0];
    expect(header).toContain("Payer Name");
    expect(header).not.toContain("Donor");
  });

  it("neutralises formula injection in the note", () => {
    const csv = buildDepositPaymentsCsv([row({ note: "=HYPERLINK(\"http://x\")" })], base);
    expect(csv).toContain("\"'=HYPERLINK(\"\"http://x\"\")\"");
  });
});
