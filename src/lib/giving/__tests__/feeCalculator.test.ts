/**
 * WGC Fee Matrix v3 — Automated Tests
 *
 * Required by specification, section 15.
 * All $25.00 examples verified against section 8.
 *
 * Approved matrix:
 *   Donor covers, non-Amex card  → 3.00%, no $0.30
 *   Donor covers, Amex           → 3.50%, no $0.30
 *   Donor covers, ACH            → $0.25 flat
 *   Org covers,   non-Amex card  → 2.30% + $0.30
 *   Org covers,   Amex           → 3.50% + $0.30
 *   Org covers,   ACH            → $0.25 flat
 */
import { describe, it, expect } from "vitest";
import { calculateDynamicSupplementalFee, normalizeCardBrand } from "../feeCalculator";

// ─── Helper ──────────────────────────────────────────────────────────────────

function calc(
  donationAmountCents: number,
  donorCoversFee: boolean,
  paymentMethod: "CARD" | "ACH",
  cardBrand?: string
) {
  return calculateDynamicSupplementalFee({
    donationAmountCents,
    donorCoversFee,
    paymentMethod,
    cardBrand,
  });
}

// ─── normalizeCardBrand ───────────────────────────────────────────────────────

describe("normalizeCardBrand", () => {
  it("normalizes common card brands", () => {
    expect(normalizeCardBrand("visa")).toBe("VISA");
    expect(normalizeCardBrand("Visa ")).toBe("VISA");
    expect(normalizeCardBrand("MasterCard")).toBe("MASTERCARD");
    expect(normalizeCardBrand("master_card")).toBe("MASTERCARD");
    expect(normalizeCardBrand("MC")).toBe("MASTERCARD");
    expect(normalizeCardBrand("American Express")).toBe("AMERICAN_EXPRESS");
    expect(normalizeCardBrand("AMEX")).toBe("AMERICAN_EXPRESS");
    expect(normalizeCardBrand("american_express")).toBe("AMERICAN_EXPRESS");
    expect(normalizeCardBrand("discover")).toBe("DISCOVER");
    expect(normalizeCardBrand(null)).toBe("UNKNOWN");
    expect(normalizeCardBrand("")).toBe("UNKNOWN");
    expect(normalizeCardBrand("RandomBrand")).toBe("UNKNOWN");
  });
});

// ─── Tests 1–5: Donor Covers ──────────────────────────────────────────────────

describe("DONOR COVERS FEE — $25.00 donations", () => {
  // Test 1: Visa, donor covers → 3.00%, no $0.30
  it("1. $25 Visa, donor covers: fee=$0.75, charge=$25.75, supplemental=75, fixed=$0", () => {
    const r = calc(2500, true, "CARD", "VISA");
    expect(r.processingFeeCents).toBe(75);          // Math.round(2500*300/10000)
    expect(r.donorChargeAmountCents).toBe(2575);
    expect(r.supplementalFeeCents).toBe(75);
    expect(r.fixedFeeCents).toBe(0);
    expect(r.percentageBps).toBe(300);
    expect(r.merchantExpectedNetCents).toBe(2500);
  });

  // Test 2: Mastercard, donor covers → 3.00% (same as Visa), no $0.30
  it("2. $25 Mastercard, donor covers: fee=$0.75, charge=$25.75, supplemental=75, fixed=$0", () => {
    const r = calc(2500, true, "CARD", "MASTERCARD");
    expect(r.processingFeeCents).toBe(75);
    expect(r.donorChargeAmountCents).toBe(2575);
    expect(r.supplementalFeeCents).toBe(75);
    expect(r.fixedFeeCents).toBe(0);
    expect(r.percentageBps).toBe(300);
    expect(r.merchantExpectedNetCents).toBe(2500);
  });

  // Test 3: Discover, donor covers → 3.00%, no $0.30
  it("3. $25 Discover, donor covers: fee=$0.75, charge=$25.75, supplemental=75, fixed=$0", () => {
    const r = calc(2500, true, "CARD", "DISCOVER");
    expect(r.processingFeeCents).toBe(75);
    expect(r.donorChargeAmountCents).toBe(2575);
    expect(r.supplementalFeeCents).toBe(75);
    expect(r.fixedFeeCents).toBe(0);
    expect(r.percentageBps).toBe(300);
    expect(r.merchantExpectedNetCents).toBe(2500);
  });

  // Test 4: Amex, donor covers → 3.50%, no $0.30 (Math.round(2500*350/10000)=88)
  it("4. $25 Amex, donor covers: fee=$0.88, charge=$25.88, supplemental=88, fixed=$0", () => {
    const r = calc(2500, true, "CARD", "AMERICAN_EXPRESS");
    expect(r.processingFeeCents).toBe(88);
    expect(r.donorChargeAmountCents).toBe(2588);
    expect(r.supplementalFeeCents).toBe(88);
    expect(r.fixedFeeCents).toBe(0);
    expect(r.percentageBps).toBe(350);
    expect(r.merchantExpectedNetCents).toBe(2500);
  });

  // Test 5: ACH, donor covers → $0.25 flat
  it("5. $25 ACH, donor covers: fee=$0.25, charge=$25.25, supplemental=25", () => {
    const r = calc(2500, true, "ACH");
    expect(r.processingFeeCents).toBe(25);
    expect(r.donorChargeAmountCents).toBe(2525);
    expect(r.supplementalFeeCents).toBe(25);
    expect(r.percentageBps).toBe(0);
    expect(r.fixedFeeCents).toBe(25);
    expect(r.merchantExpectedNetCents).toBe(2500);
  });
});

// ─── Tests 6–10: Org Covers ───────────────────────────────────────────────────

describe("ORG COVERS FEE — $25.00 donations", () => {
  // Test 6: Visa, org covers → 2.30%+$0.30
  // Math.round(2500*230/10000)=58; 58+30=88 cents
  it("6. $25 Visa, org covers: fee=$0.88, charge=$25.00, no supplemental, net=$24.12", () => {
    const r = calc(2500, false, "CARD", "VISA");
    expect(r.processingFeeCents).toBe(88);
    expect(r.donorChargeAmountCents).toBe(2500);
    expect(r.supplementalFeeCents).toBe(0);        // MUST be 0
    expect(r.merchantExpectedNetCents).toBe(2412); // 2500-88
    expect(r.percentageBps).toBe(230);
    expect(r.fixedFeeCents).toBe(30);
  });

  // Test 7: Mastercard, org covers → 2.30%+$0.30 (same as Visa on org path)
  it("7. $25 Mastercard, org covers: fee=$0.88, charge=$25.00, no supplemental, net=$24.12", () => {
    const r = calc(2500, false, "CARD", "MASTERCARD");
    expect(r.processingFeeCents).toBe(88);
    expect(r.donorChargeAmountCents).toBe(2500);
    expect(r.supplementalFeeCents).toBe(0);
    expect(r.merchantExpectedNetCents).toBe(2412);
    expect(r.percentageBps).toBe(230);
    expect(r.fixedFeeCents).toBe(30);
  });

  // Test 8: Discover, org covers → 2.30%+$0.30
  it("8. $25 Discover, org covers: fee=$0.88, charge=$25.00, no supplemental, net=$24.12", () => {
    const r = calc(2500, false, "CARD", "DISCOVER");
    expect(r.processingFeeCents).toBe(88);
    expect(r.donorChargeAmountCents).toBe(2500);
    expect(r.supplementalFeeCents).toBe(0);
    expect(r.merchantExpectedNetCents).toBe(2412);
    expect(r.percentageBps).toBe(230);
    expect(r.fixedFeeCents).toBe(30);
  });

  // Test 9: Amex, org covers → 3.50%+$0.30
  // Math.round(2500*350/10000)=88; 88+30=118 cents
  it("9. $25 Amex, org covers: fee=$1.18, charge=$25.00, no supplemental, net=$23.82", () => {
    const r = calc(2500, false, "CARD", "AMERICAN_EXPRESS");
    expect(r.processingFeeCents).toBe(118);
    expect(r.donorChargeAmountCents).toBe(2500);
    expect(r.supplementalFeeCents).toBe(0);
    expect(r.merchantExpectedNetCents).toBe(2382); // 2500-118
    expect(r.percentageBps).toBe(350);
    expect(r.fixedFeeCents).toBe(30);
  });

  // Test 10: ACH, org covers → $0.25 flat, donor charged donation only
  it("10. $25 ACH, org covers: fee=$0.25, charge=$25.00, no supplemental, net=$24.75", () => {
    const r = calc(2500, false, "ACH");
    expect(r.processingFeeCents).toBe(25);
    expect(r.donorChargeAmountCents).toBe(2500);
    expect(r.supplementalFeeCents).toBe(0);
    expect(r.merchantExpectedNetCents).toBe(2475);
    expect(r.percentageBps).toBe(0);
    expect(r.fixedFeeCents).toBe(25);
  });
});

// ─── Tests 11–17: Invariant / Failure Tests ───────────────────────────────────

describe("INVARIANT FAILURES — these conditions must never occur", () => {
  // Test 11: Donor covers but supplemental_fee is 0 → FAIL
  it("11. Donor covers non-Amex card: supplementalFeeCents must be > 0", () => {
    const r = calc(2500, true, "CARD", "VISA");
    expect(r.supplementalFeeCents).toBeGreaterThan(0);
  });

  // Test 12: Org covers but supplemental_fee is non-zero → FAIL
  it("12. Org covers non-Amex card: supplementalFeeCents must be 0", () => {
    const r = calc(2500, false, "CARD", "VISA");
    expect(r.supplementalFeeCents).toBe(0);
  });

  // Test 13: Donor covers non-Amex but $0.30 is added → FAIL
  it("13. Donor covers non-Amex: fixedFeeCents must be 0, not $0.30", () => {
    const r = calc(2500, true, "CARD", "VISA");
    expect(r.fixedFeeCents).toBe(0);
  });

  // Test 14: Donor covers Amex but only 3.00% used → FAIL
  it("14. Donor covers Amex: must use 3.50% (350 bps), not 3.00%", () => {
    const r = calc(2500, true, "CARD", "AMERICAN_EXPRESS");
    expect(r.percentageBps).toBe(350);
    expect(r.percentageBps).not.toBe(300);
  });

  // Test 15: Org covers Amex but 2.30% default used → FAIL
  it("15. Org covers Amex: must use 3.50% (350 bps), not 2.30%", () => {
    const r = calc(2500, false, "CARD", "AMERICAN_EXPRESS");
    expect(r.percentageBps).toBe(350);
    expect(r.percentageBps).not.toBe(230);
  });

  // Test 16: ACH fee interpreted as 0.25 cents instead of 25 cents → FAIL
  it("16. ACH fee must be 25 cents, not 0.25 cents", () => {
    const r = calc(2500, true, "ACH");
    expect(r.processingFeeCents).toBe(25);
    expect(r.processingFeeCents).not.toBe(0); // not 0.25 of a cent rounded to 0
    expect(r.supplementalFeeCents).toBe(25);
  });

  // Test 17: Transaction must not receive both supplemental_fee AND nonzero org fee
  it("17. A transaction cannot have both non-zero supplemental AND org-paid fee scenario", () => {
    // Donor covers → supplementalFeeCents > 0, donor pays the fee
    const donorCovers = calc(2500, true, "CARD", "VISA");
    expect(donorCovers.supplementalFeeCents).toBeGreaterThan(0);
    // Org covers → supplementalFeeCents must be 0
    const orgCovers = calc(2500, false, "CARD", "VISA");
    expect(orgCovers.supplementalFeeCents).toBe(0);
    // They cannot BOTH be non-zero for the same transaction
    // (this test enforces the invariant for both arms)
  });
});

// ─── Tests 18–20: Recurring ───────────────────────────────────────────────────

describe("RECURRING — same fee matrix applies on every charge", () => {
  // Test 18: Recurring non-Amex card, donor covers → 3.00%
  it("18. Recurring non-Amex, donor covers: 3.00% on every charge", () => {
    // Simulate three separate charges (same amount, recurring)
    for (const amount of [2500, 5000, 10000]) {
      const r = calc(amount, true, "CARD", "VISA");
      expect(r.percentageBps).toBe(300);
      expect(r.fixedFeeCents).toBe(0);
      const expectedFee = Math.round(amount * 300 / 10000);
      expect(r.supplementalFeeCents).toBe(expectedFee);
    }
  });

  // Test 19: Recurring Amex, donor covers → 3.50%
  it("19. Recurring Amex, donor covers: 3.50% on every charge", () => {
    for (const amount of [2500, 5000, 10000]) {
      const r = calc(amount, true, "CARD", "AMEX");
      expect(r.percentageBps).toBe(350);
      expect(r.fixedFeeCents).toBe(0);
      const expectedFee = Math.round(amount * 350 / 10000);
      expect(r.supplementalFeeCents).toBe(expectedFee);
    }
  });

  // Test 20: Recurring ACH, org covers → $0.25 flat, no supplemental
  it("20. Recurring ACH, org covers: $0.25 flat, supplementalFeeCents=0", () => {
    for (const amount of [2500, 5000, 10000]) {
      const r = calc(amount, false, "ACH");
      expect(r.processingFeeCents).toBe(25);
      expect(r.donorChargeAmountCents).toBe(amount);
      expect(r.supplementalFeeCents).toBe(0);
    }
  });
});

// ─── Additional: $100 verification ───────────────────────────────────────────

describe("$100 cross-check", () => {
  it("$100 Visa donor covers: 3.00%=$3.00, charge=$103.00", () => {
    const r = calc(10000, true, "CARD", "VISA");
    expect(r.processingFeeCents).toBe(300);
    expect(r.donorChargeAmountCents).toBe(10300);
    expect(r.supplementalFeeCents).toBe(300);
  });

  it("$100 Visa org covers: 2.30%+$0.30=$2.60, charge=$100.00, net=$97.40", () => {
    const r = calc(10000, false, "CARD", "VISA");
    expect(r.processingFeeCents).toBe(260); // 230+30
    expect(r.donorChargeAmountCents).toBe(10000);
    expect(r.supplementalFeeCents).toBe(0);
    expect(r.merchantExpectedNetCents).toBe(9740);
  });

  it("$100 Amex donor covers: 3.50%=$3.50, charge=$103.50, no $0.30", () => {
    const r = calc(10000, true, "CARD", "AMERICAN_EXPRESS");
    expect(r.processingFeeCents).toBe(350);
    expect(r.donorChargeAmountCents).toBe(10350);
    expect(r.supplementalFeeCents).toBe(350);
    expect(r.fixedFeeCents).toBe(0);
  });

  it("$100 Amex org covers: 3.50%+$0.30=$3.80, net=$96.20", () => {
    const r = calc(10000, false, "CARD", "AMERICAN_EXPRESS");
    expect(r.processingFeeCents).toBe(380);
    expect(r.supplementalFeeCents).toBe(0);
    expect(r.merchantExpectedNetCents).toBe(9620);
  });
});
