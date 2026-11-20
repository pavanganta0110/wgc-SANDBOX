import { describe, it, expect } from "vitest";
import { checkRefundEligibility } from "../refundEligibility";

const CHURCH_ID = "church_1";

function makeTransfer(overrides: Partial<Record<string, any>> = {}) {
  return {
    churchId: CHURCH_ID,
    type: "TRANSFER",
    state: "SUCCEEDED",
    amountCents: 10000,
    ...overrides,
  } as any;
}

describe("checkRefundEligibility remaining balance", () => {
  it("returns the full amount as remainingCents when nothing has been refunded yet", () => {
    const result = checkRefundEligibility(makeTransfer(), [], [], CHURCH_ID);
    expect(result.eligible).toBe(true);
    expect(result.remainingCents).toBe(10000);
  });

  it("subtracts a prior SUCCEEDED partial refund from remainingCents", () => {
    const refunds = [{ state: "SUCCEEDED", amountCents: 4000 }] as any;
    const result = checkRefundEligibility(makeTransfer(), refunds, [], CHURCH_ID);
    expect(result.eligible).toBe(true);
    expect(result.remainingCents).toBe(6000);
  });

  it("also counts a PENDING refund against remainingCents, not just SUCCEEDED", () => {
    const refunds = [{ state: "PENDING", amountCents: 3000 }] as any;
    const result = checkRefundEligibility(makeTransfer(), refunds, [], CHURCH_ID);
    expect(result.eligible).toBe(true);
    expect(result.remainingCents).toBe(7000);
  });

  it("is ineligible with no remainingCents once fully refunded", () => {
    const refunds = [{ state: "SUCCEEDED", amountCents: 10000 }] as any;
    const result = checkRefundEligibility(makeTransfer(), refunds, [], CHURCH_ID);
    expect(result.eligible).toBe(false);
    expect(result.remainingCents).toBeUndefined();
  });

  it("reflects two prior partial refunds cumulatively, guarding against a second refund reusing the original amount", () => {
    const refunds = [
      { state: "SUCCEEDED", amountCents: 6000 },
      { state: "SUCCEEDED", amountCents: 2000 },
    ] as any;
    const result = checkRefundEligibility(makeTransfer(), refunds, [], CHURCH_ID);
    expect(result.eligible).toBe(true);
    // Only $20.00 left, not the original $100.00 — this is the exact value
    // the refund route now bounds a new refund request against.
    expect(result.remainingCents).toBe(2000);
  });
});

describe("checkRefundEligibility transfer types (real Finix data)", () => {
  it("allows a normal card/ACH sale, which Finix stores as DEBIT / API", () => {
    const result = checkRefundEligibility(makeTransfer({ type: "DEBIT", subtype: "API" }), [], [], CHURCH_ID);
    expect(result.eligible).toBe(true);
    expect(result.remainingCents).toBe(10000);
  });

  it("allows a DEBIT with no subtype (a sale entered in the processing dashboard)", () => {
    expect(checkRefundEligibility(makeTransfer({ type: "DEBIT", subtype: null }), [], [], CHURCH_ID).eligible).toBe(true);
  });

  it("never allows refunding a refund (REVERSAL)", () => {
    expect(checkRefundEligibility(makeTransfer({ type: "REVERSAL", subtype: "API" }), [], [], CHURCH_ID).eligible).toBe(false);
  });

  it("never allows refunding settlement or payout movements", () => {
    expect(checkRefundEligibility(makeTransfer({ type: "DEBIT", subtype: "SETTLEMENT_MERCHANT" }), [], [], CHURCH_ID).eligible).toBe(false);
    expect(checkRefundEligibility(makeTransfer({ type: "CREDIT", subtype: "SETTLEMENT_PLATFORM" }), [], [], CHURCH_ID).eligible).toBe(false);
  });
});
