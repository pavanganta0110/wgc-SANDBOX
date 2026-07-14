import { describe, it, expect } from "vitest";
import { resolveDonorLinkage, needsReconciliation, isStaleEnoughToReconcile, SUBSCRIPTION_RECONCILE_THROTTLE_MS } from "@/lib/subscriptions/subscriptionReconciliation";

describe("resolveDonorLinkage", () => {
  it("test 4/5: resolves via the linked payment instrument's donor when the subscription itself has none", () => {
    const result = resolveDonorLinkage({ donorId: null, needsDonorMatching: false }, "donor-123");
    expect(result).toEqual({ donorId: "donor-123", needsDonorMatching: false });
  });

  it("keeps an already-known donorId as-is, never overwritten by the instrument lookup", () => {
    const result = resolveDonorLinkage({ donorId: "donor-original", needsDonorMatching: false }, "donor-different");
    expect(result.donorId).toBe("donor-original");
  });

  it("test 6: leaves unlinked and flags for admin review when neither the subscription nor its instrument has a donor — never guesses", () => {
    const result = resolveDonorLinkage({ donorId: null, needsDonorMatching: false }, null);
    expect(result).toEqual({ donorId: null, needsDonorMatching: true });
  });

  it("stays flagged for review on a repeat pass that still can't resolve a donor", () => {
    const result = resolveDonorLinkage({ donorId: null, needsDonorMatching: true }, null);
    expect(result.needsDonorMatching).toBe(true);
    expect(result.donorId).toBeNull();
  });
});

describe("needsReconciliation", () => {
  it("test 8: an ACTIVE subscription whose nextBillingAt has already passed needs reconciliation", () => {
    const stale = { state: "ACTIVE", nextBillingDate: new Date(Date.now() - 60_000), lastReconciledAt: null };
    expect(needsReconciliation(stale)).toBe(true);
  });

  it("an ACTIVE subscription with a genuinely future nextBillingAt does not need reconciliation", () => {
    const fresh = { state: "ACTIVE", nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), lastReconciledAt: new Date() };
    expect(needsReconciliation(fresh)).toBe(false);
  });

  it("a non-ACTIVE subscription (e.g. CANCELED) is never picked up by the reconciliation pass", () => {
    const canceled = { state: "CANCELED", nextBillingDate: new Date(Date.now() - 60_000), lastReconciledAt: null };
    expect(needsReconciliation(canceled)).toBe(false);
  });

  it("an ACTIVE subscription with no nextBillingDate at all needs reconciliation", () => {
    expect(needsReconciliation({ state: "ACTIVE", nextBillingDate: null, lastReconciledAt: null })).toBe(true);
  });

  it("respects the reconcile throttle — a recently-reconciled stale-looking row is not re-checked immediately", () => {
    const justReconciled = { state: "ACTIVE", nextBillingDate: new Date(Date.now() - 60_000), lastReconciledAt: new Date() };
    expect(needsReconciliation(justReconciled)).toBe(false);
  });
});

describe("isStaleEnoughToReconcile", () => {
  it("is stale when never reconciled", () => {
    expect(isStaleEnoughToReconcile(null)).toBe(true);
  });
  it("is not stale immediately after reconciling", () => {
    expect(isStaleEnoughToReconcile(new Date())).toBe(false);
  });
  it("is stale once older than the throttle window", () => {
    expect(isStaleEnoughToReconcile(new Date(Date.now() - SUBSCRIPTION_RECONCILE_THROTTLE_MS - 1000))).toBe(true);
  });
});
