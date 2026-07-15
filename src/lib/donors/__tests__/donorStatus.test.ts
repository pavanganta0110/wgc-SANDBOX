import { describe, it, expect } from "vitest";
import { resolveDonorDisplayStatus, resolveDonorNeedsAttentionReasons, type DonorStatusInput } from "@/lib/donors/donorStatus";

const BASE: DonorStatusInput = {
  archivedAt: null,
  hasActiveSubscription: false,
  hasPastDueSubscription: false,
  hasRecentBankReturn: false,
  hasOpenDispute: false,
  hasRecentRepeatedFailures: false,
  hasDisabledPaymentMethodOnActiveSubscription: false,
  hasRecentSuccessfulDonation: false,
};

describe("resolveDonorDisplayStatus", () => {
  it("prioritizes ARCHIVED above everything else", () => {
    const status = resolveDonorDisplayStatus({ ...BASE, archivedAt: new Date(), hasActiveSubscription: true, hasOpenDispute: true });
    expect(status).toBe("ARCHIVED");
  });

  it("returns AT_RISK when a dispute is open, even with an active subscription", () => {
    const status = resolveDonorDisplayStatus({ ...BASE, hasActiveSubscription: true, hasOpenDispute: true });
    expect(status).toBe("AT_RISK");
  });

  it("returns AT_RISK for a past-due subscription", () => {
    expect(resolveDonorDisplayStatus({ ...BASE, hasPastDueSubscription: true })).toBe("AT_RISK");
  });

  it("returns AT_RISK for a recent bank return", () => {
    expect(resolveDonorDisplayStatus({ ...BASE, hasRecentBankReturn: true })).toBe("AT_RISK");
  });

  it("returns AT_RISK for repeated recent failures", () => {
    expect(resolveDonorDisplayStatus({ ...BASE, hasRecentRepeatedFailures: true })).toBe("AT_RISK");
  });

  it("returns RECURRING when there's an active subscription and no risk signal", () => {
    expect(resolveDonorDisplayStatus({ ...BASE, hasActiveSubscription: true })).toBe("RECURRING");
  });

  it("returns ACTIVE for a recent successful donation with no subscription or risk", () => {
    expect(resolveDonorDisplayStatus({ ...BASE, hasRecentSuccessfulDonation: true })).toBe("ACTIVE");
  });

  it("returns INACTIVE when nothing else applies", () => {
    expect(resolveDonorDisplayStatus(BASE)).toBe("INACTIVE");
  });
});

describe("resolveDonorNeedsAttentionReasons", () => {
  it("returns an empty list when nothing is wrong", () => {
    expect(resolveDonorNeedsAttentionReasons(BASE)).toEqual([]);
  });

  it("lists every applicable reason, not just the first", () => {
    const reasons = resolveDonorNeedsAttentionReasons({ ...BASE, hasPastDueSubscription: true, hasOpenDispute: true });
    expect(reasons).toContain("Past-due recurring donation");
    expect(reasons).toContain("Open dispute");
    expect(reasons).toHaveLength(2);
  });
});
