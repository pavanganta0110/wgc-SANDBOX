import { describe, it, expect } from "vitest";
import { computeBankReconciliation } from "@/lib/reports/bankReconciliation";
import { buildReconciliationCards } from "@/lib/reports/reconciliationCards";

const base = {
  chargedCents: 0, refundedCents: 0, feesCents: 0, payoutFeeCents: 0, payoutFeeCount: 0,
  depositedCents: 0, depositCount: 0, pulledBackCents: 0, pendingFeeCount: 0,
};
const labels = (cards: { label: string }[]) => cards.map((c) => c.label);

describe("buildReconciliationCards — a fee shows only when it was charged", () => {
  it("shows no fee or refund card at all when nothing was charged", () => {
    const r = computeBankReconciliation({ ...base, chargedCents: 100000, depositedCents: 100000, depositCount: 1 });
    const c = buildReconciliationCards(r, 0);
    expect(labels(c.charges)).toEqual(["Total Charged"]);
    expect(labels(c.bank)).toEqual(["Net After Fees", "Deposited to Bank", "Awaiting Deposit"]);
    expect(c.caption).toContain("Net After Fees = Total Charged.");
    expect(c.caption).not.toMatch(/fee|payout fee|50¢|15th/i.test(c.caption) ? /^$/ : /Fees Charged|Fees Covered|Fees Paid|50¢|15th/);
    expect(c.showFeeTypes).toBe(false);
  });

  it("shows the covered-by-payers card only when payers covered a fee", () => {
    const r = computeBankReconciliation({ ...base, chargedCents: 103000, feesCents: 3000 });
    const none = buildReconciliationCards(r, 0);
    expect(labels(none.charges)).toEqual(["Total Charged", "Fees Charged", "Fees Paid by Organization"]);
    const some = buildReconciliationCards(r, 3000);
    expect(labels(some.charges)).toEqual(["Total Charged", "Fees Charged", "Fees Covered by Payers"]);
  });

  it("shows the organization-paid card only when the organization paid some fee", () => {
    const r = computeBankReconciliation({ ...base, chargedCents: 568449, feesCents: 17799, payoutFeeCents: 1300, payoutFeeCount: 26 });
    const c = buildReconciliationCards(r, 14749);
    expect(labels(c.charges)).toEqual(["Total Charged", "Fees Charged", "Fees Covered by Payers", "Fees Paid by Organization"]);
    expect(c.charges.find((x) => x.label === "Fees Covered by Payers")?.value).toBe("$147.49");
    expect(c.charges.find((x) => x.label === "Fees Paid by Organization")?.value).toBe("$30.50");
    expect(c.charges.find((x) => x.label === "Fees Paid by Organization")?.note).toBe("Includes $13.00 in payout fees (26 payouts)");
    // fully covered: nothing left for the organization to have paid
    const covered = buildReconciliationCards(computeBankReconciliation({ ...base, chargedCents: 103000, feesCents: 3000 }), 3000);
    expect(labels(covered.charges)).not.toContain("Fees Paid by Organization");
  });

  it("never lets a covered amount exceed the fees that were actually charged", () => {
    const r = computeBankReconciliation({ ...base, chargedCents: 10000, feesCents: 200 });
    const c = buildReconciliationCards(r, 999);
    expect(c.charges.find((x) => x.label === "Fees Covered by Payers")?.value).toBe("$2.00");
    expect(labels(c.charges)).not.toContain("Fees Paid by Organization");
  });

  it("shows refunds & returns only when there were some", () => {
    const withRefund = buildReconciliationCards(computeBankReconciliation({ ...base, chargedCents: 10000, refundedCents: 2500 }), 0);
    expect(labels(withRefund.bank)[0]).toBe("Refunds & Returns");
    expect(withRefund.caption).toContain("Net After Fees = Total Charged − Refunds & Returns.");
    const without = buildReconciliationCards(computeBankReconciliation({ ...base, chargedCents: 10000 }), 0);
    expect(labels(without.bank)).not.toContain("Refunds & Returns");
  });

  it("only mentions payout fees and the fee-finalization delay when they apply", () => {
    const withFees = buildReconciliationCards(computeBankReconciliation({ ...base, chargedCents: 5000, feesCents: 150, payoutFeeCents: 50, payoutFeeCount: 1 }), 0);
    expect(withFees.caption).toContain("about 50¢");
    expect(withFees.caption).toContain("15th");
    const noPayoutFee = buildReconciliationCards(computeBankReconciliation({ ...base, chargedCents: 5000, feesCents: 150 }), 0);
    expect(noPayoutFee.caption).not.toContain("50¢");
  });

  it("explains payments whose fees are not final yet", () => {
    const c = buildReconciliationCards(computeBankReconciliation({ ...base, chargedCents: 103000, pendingFeeCount: 2 }), 0);
    expect(c.caption).toContain("2 recent payments don't have final fees yet");
  });

  it("lists the fee-type table only when a fee type applied", () => {
    const none = buildReconciliationCards(computeBankReconciliation({ ...base, chargedCents: 100 }), 0);
    expect(none.showFeeTypes).toBe(false);
    const some = buildReconciliationCards(
      computeBankReconciliation({ ...base, chargedCents: 100, feesCents: 25 }, [{ key: "CARD_PROCESSING", label: "Card processing fee", count: 1, amountCents: 25, isPayoutFee: false }]),
      0
    );
    expect(some.showFeeTypes).toBe(true);
  });
});
