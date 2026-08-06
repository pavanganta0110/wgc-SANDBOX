import { describe, it, expect } from "vitest";
import { resolveContributionAmountPolicy } from "../contributionPolicy";
import type { ContributionFinancialSnapshot } from "../financialSnapshot";

function snapshot(overrides: Partial<ContributionFinancialSnapshot> = {}): ContributionFinancialSnapshot {
  return {
    paymentId: "pay-1",
    finixTransferId: "transfer-1",
    donorId: "donor-1",
    fundId: "fund-1",
    isAnonymous: false,
    donationAmountCents: 10000,
    feeCoveredCents: 0,
    totalChargedCents: 10000,
    processorFeeCents: 320,
    applicationFeeCents: 100,
    goodsServicesProvided: false,
    goodsServicesFairMarketValueCents: null,
    ...overrides,
  };
}

describe("resolveContributionAmountPolicy", () => {
  it("resolves cleanly when there is no donor-covered fee (receipt and statement amounts agree)", () => {
    const result = resolveContributionAmountPolicy(snapshot({ donationAmountCents: 10000, totalChargedCents: 10000 }));
    expect(result.resolved).toBe(true);
    expect(result.contributionAmountCents).toBe(10000);
  });

  it("returns unresolved when a donor-covered fee makes receipt and statement amounts disagree", () => {
    const result = resolveContributionAmountPolicy(snapshot({ donationAmountCents: 10000, feeCoveredCents: 320, totalChargedCents: 10320 }));
    expect(result.resolved).toBe(false);
    expect(result.contributionAmountCents).toBeUndefined();
    expect(result.explanation).toContain("donor-covered fee");
  });

  it("never guesses an amount when unresolved", () => {
    const result = resolveContributionAmountPolicy(snapshot({ donationAmountCents: 5000, totalChargedCents: 5320 }));
    expect(result.resolved).toBe(false);
    expect("contributionAmountCents" in result).toBe(false);
  });
});
