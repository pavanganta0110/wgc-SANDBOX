import { describe, it, expect } from "vitest";
import { computeBankReconciliation } from "@/lib/reports/bankReconciliation";

const base = {
  chargedCents: 0,
  refundedCents: 0,
  feesCents: 0,
  payoutFeeCents: 0,
  payoutFeeCount: 0,
  depositedCents: 0,
  depositCount: 0,
  pulledBackCents: 0,
  pendingFeeCount: 0,
};

describe("computeBankReconciliation", () => {
  it("reproduces the admin money table for a real organization (collected $5,684.49, fees $177.99, deposited $5,512.00)", () => {
    // Care Package Inbound: Awaiting deposit shows -$0.50, which means Finix pulled $5.00 back from the bank.
    const r = computeBankReconciliation({
      ...base,
      chargedCents: 568449,
      feesCents: 17799,
      payoutFeeCents: 1300,
      payoutFeeCount: 26,
      depositedCents: 551200,
      depositCount: 26,
      pulledBackCents: 500,
    });
    expect(r.netAfterFeesCents).toBe(550650);
    expect(r.netDepositedCents).toBe(550700);
    expect(r.awaitingDepositCents).toBe(-50);
  });

  it("shows money still in flight when nothing has been paid out yet (collected $1,030.00, no fees recorded)", () => {
    const r = computeBankReconciliation({ ...base, chargedCents: 103000, pendingFeeCount: 1 });
    expect(r.netAfterFeesCents).toBe(103000);
    expect(r.awaitingDepositCents).toBe(103000);
    expect(r.pendingFeeCount).toBe(1);
  });

  it("takes refunds, returns and every fee off the charge, and a partly paid out organization reconciles", () => {
    // Lighthouse: collected $758.73, fees $9.23 (of which payout $1.50), deposited $100.00.
    const r = computeBankReconciliation({ ...base, chargedCents: 75873, feesCents: 923, payoutFeeCents: 150, payoutFeeCount: 3, depositedCents: 10000, depositCount: 1 });
    expect(r.netAfterFeesCents).toBe(74950);
    expect(r.awaitingDepositCents).toBe(64950);
  });

  it("subtracts refunds", () => {
    const r = computeBankReconciliation({ ...base, chargedCents: 10000, refundedCents: 2500, feesCents: 300 });
    expect(r.netAfterFeesCents).toBe(7200);
  });

  it("is zero everywhere for an organization with no activity", () => {
    const r = computeBankReconciliation(base);
    expect([r.netAfterFeesCents, r.netDepositedCents, r.awaitingDepositCents]).toEqual([0, 0, 0]);
  });

  it("always satisfies awaiting = net after fees - deposited + pulled back", () => {
    const r = computeBankReconciliation({ ...base, chargedCents: 123456, refundedCents: 789, feesCents: 4321, depositedCents: 100000, pulledBackCents: 250 });
    expect(r.awaitingDepositCents).toBe(r.netAfterFeesCents - (100000 - 250));
  });
});
