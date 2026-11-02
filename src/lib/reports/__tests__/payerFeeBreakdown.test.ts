import { describe, it, expect } from "vitest";
import { computePayerFeeBreakdown } from "@/lib/reports/insightsData";

describe("computePayerFeeBreakdown", () => {
  it("separates the fee a payer covered from what the organization receives ($1,030 charged = $30 fee + $1,000)", () => {
    const r = computePayerFeeBreakdown(
      [{ finixTransferId: "TR_1", amountCents: 103000 }],
      [{ finixTransferId: "TR_1", feeCoveredCents: 3000 }]
    );
    expect(r).toEqual({ chargedCents: 103000, feesCoveredCents: 3000, amountToOrganizationCents: 100000 });
  });

  it("treats a payment where the payer covered nothing as fully the organization's", () => {
    const r = computePayerFeeBreakdown([{ finixTransferId: "TR_1", amountCents: 5000 }], [{ finixTransferId: "TR_1", feeCoveredCents: null }]);
    expect(r).toEqual({ chargedCents: 5000, feesCoveredCents: 0, amountToOrganizationCents: 5000 });
  });

  it("handles transfers with no payment row (for example invoice payments)", () => {
    const r = computePayerFeeBreakdown([{ finixTransferId: "TR_9", amountCents: 7500 }], []);
    expect(r).toEqual({ chargedCents: 7500, feesCoveredCents: 0, amountToOrganizationCents: 7500 });
  });

  it("adds up across payments and always satisfies charged = fees + amount to organization", () => {
    const transfers = [
      { finixTransferId: "A", amountCents: 103000 },
      { finixTransferId: "B", amountCents: 2575 },
      { finixTransferId: "C", amountCents: null },
    ];
    const payments = [
      { finixTransferId: "A", feeCoveredCents: 3000 },
      { finixTransferId: "B", feeCoveredCents: 75 },
    ];
    const r = computePayerFeeBreakdown(transfers, payments);
    expect(r.chargedCents).toBe(105575);
    expect(r.feesCoveredCents).toBe(3075);
    expect(r.feesCoveredCents + r.amountToOrganizationCents).toBe(r.chargedCents);
  });

  it("never lets a bad fee value exceed the charge or go negative", () => {
    const r = computePayerFeeBreakdown(
      [
        { finixTransferId: "A", amountCents: 1000 },
        { finixTransferId: "B", amountCents: 1000 },
      ],
      [
        { finixTransferId: "A", feeCoveredCents: 99999 },
        { finixTransferId: "B", feeCoveredCents: -50 },
      ]
    );
    expect(r).toEqual({ chargedCents: 2000, feesCoveredCents: 1000, amountToOrganizationCents: 1000 });
  });
});
