import { describe, it, expect } from "vitest";
import { classifyFeeType, groupFeesByType } from "@/lib/reports/feeTypes";

describe("classifyFeeType", () => {
  it.each([
    ["CARD_BASIS_POINTS", "Card processing fee", false],
    ["CARD_FIXED", "Card processing fee", false],
    ["ACH_BASIS_POINTS", "ACH processing fee", false],
    ["ACH_FIXED", "ACH processing fee", false],
    ["SUPPLEMENTAL_FEE_FIXED", "Supplemental fee", false],
    ["SETTLEMENT_FUNDING_TRANSFER_ACH_FIXED", "Payout fee", true],
    ["SETTLEMENT_FUNDING_TRANSFER_SAME_DAY_ACH_FIXED", "Same-day payout fee", true],
    ["SETTLEMENT_FUNDING_TRANSFER_ACH_DEBIT_RETURN_FIXED", "Payout return fee (debit)", true],
    ["SETTLEMENT_FUNDING_TRANSFER_ACH_CREDIT_RETURN_FIXED", "Payout return fee (credit)", true],
    ["SETTLEMENT_FUNDING_TRANSFER_NOC_DEBIT", "Payout correction (NOC) fee (debit)", true],
    ["INSTANT_PAYOUT_BASIS_POINTS", "Instant payout fee", true],
    ["ACH_DEBIT_RETURN_FIXED", "ACH return fee (debit)", false],
    ["ACH_CREDIT_RETURN_FIXED", "ACH return fee (credit)", false],
    ["ACH_NOC_DEBIT_FIXED", "ACH correction (NOC) fee (debit)", false],
    ["ACH_NOC_CREDIT_FIXED", "ACH correction (NOC) fee (credit)", false],
    ["CHARGEBACK_NOTIFICATION_FIXED", "Chargeback notification fee", false],
    ["CHARGEBACK_INQUIRY_FIXED", "Chargeback inquiry fee", false],
    ["ACH_VALIDATION_PLAID_FIXED", "Bank account validation (Plaid)", false],
    ["ACCOUNT_UPDATER_FIXED", "Card account updater", false],
    ["PCI_COMPLIANCE_OVERDUE_FIXED", "PCI compliance fee", false],
    ["CARD_REFUND_FIXED", "Refund fee", false],
    ["CARD_UNCAPTURED_AUTHORIZATION_FIXED", "Uncaptured authorization fee", false],
    ["SUBSCRIPTION_CARD_BASIS_POINTS", "Subscription fee (per successful payment)", false],
  ])("%s -> %s", (raw, label, isPayout) => {
    const c = classifyFeeType(raw);
    expect(c.label).toBe(label);
    expect(c.isPayoutFee).toBe(isPayout);
  });

  it("lists a fee type it has never seen under a readable name instead of hiding it", () => {
    expect(classifyFeeType("BRAND_NEW_WIDGET_FEE").label).toBe("Brand New Widget Fee");
    expect(classifyFeeType(null).label).toBe("Other fees");
    expect(classifyFeeType("   ").label).toBe("Other fees");
  });
});

describe("groupFeesByType", () => {
  it("combines the card percentage and fixed fees into one card processing line and sums the period once", () => {
    const rows = groupFeesByType([
      { feeType: "CARD_BASIS_POINTS", count: 3, amount: 130.74 + 0.5 },
      { feeType: "CARD_FIXED", count: 3, amount: 75 },
    ]);
    expect(rows).toEqual([{ key: "CARD_PROCESSING", label: "Card processing fee", count: 6, amountCents: 206, isPayoutFee: false }]);
  });

  it("only lists charges that actually applied, never a zero line", () => {
    const rows = groupFeesByType([
      { feeType: "CARD_FIXED", count: 2, amount: 50 },
      { feeType: "ACH_DEBIT_RETURN_FIXED", count: 0, amount: 0 },
      { feeType: "CHARGEBACK_NOTIFICATION_FIXED", count: 1, amount: 0.2 },
    ]);
    expect(rows.map((r) => r.label)).toEqual(["Card processing fee"]);
  });

  it("shows exception charges as soon as they occur, biggest first", () => {
    const rows = groupFeesByType([
      { feeType: "CARD_FIXED", count: 10, amount: 250 },
      { feeType: "ACH_DEBIT_RETURN_FIXED", count: 1, amount: 500 },
      { feeType: "ACH_VALIDATION_PLAID_FIXED", count: 2, amount: 600 },
      { feeType: "SETTLEMENT_FUNDING_TRANSFER_ACH_FIXED", count: 26, amount: 1300 },
    ]);
    expect(rows.map((r) => [r.label, r.amountCents, r.count])).toEqual([
      ["Payout fee", 1300, 26],
      ["Bank account validation (Plaid)", 600, 2],
      ["ACH return fee (debit)", 500, 1],
      ["Card processing fee", 250, 10],
    ]);
  });

  it("flags payout-related lines so their total can be called out", () => {
    const rows = groupFeesByType([
      { feeType: "SETTLEMENT_FUNDING_TRANSFER_ACH_FIXED", count: 2, amount: 100 },
      { feeType: "SETTLEMENT_FUNDING_TRANSFER_SAME_DAY_ACH_FIXED", count: 1, amount: 75 },
      { feeType: "CARD_FIXED", count: 1, amount: 25 },
    ]);
    expect(rows.filter((r) => r.isPayoutFee).reduce((s, r) => s + r.amountCents, 0)).toBe(175);
  });

  it("keeps unrecognized fee types as their own lines", () => {
    const rows = groupFeesByType([
      { feeType: "NEW_THING_FEE", count: 1, amount: 300 },
      { feeType: "OTHER_THING_FEE", count: 1, amount: 200 },
    ]);
    expect(rows.map((r) => r.label)).toEqual(["New Thing Fee", "Other Thing Fee"]);
  });
});
