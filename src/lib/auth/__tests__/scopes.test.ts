import { describe, it, expect } from "vitest";
import type { MerchantAuthContext } from "@/lib/auth/requireMerchantSession";
import { buildGivingLinkScope, buildPaymentScope, buildSubscriptionScope } from "@/lib/auth/scopes";

function makeAuth(overrides: Partial<MerchantAuthContext> = {}): MerchantAuthContext {
  return {
    userId: "fundraiser-1",
    email: "f@b.com",
    churchId: "church-a",
    rawRole: "fundraiser",
    role: "fundraiser",
    isWgcAdmin: false,
    permissionsJson: null,
    authVersion: 1,
    ...overrides,
  };
}

describe("buildGivingLinkScope", () => {
  it("test 1: forces a FUNDRAISER to their own owned links even when organization-wide scope is requested", () => {
    const auth = makeAuth();
    const scope = buildGivingLinkScope(auth, { kind: "organization" });
    expect(scope).toEqual({ churchId: "church-a", ownerUserId: "fundraiser-1" });
  });

  it("test 15: organization scope for an OWNER includes unattributed/quarantined links (no ownerUserId filter)", () => {
    const auth = makeAuth({ role: "owner", rawRole: "owner", userId: "owner-1" });
    const scope = buildGivingLinkScope(auth, { kind: "organization" });
    expect(scope).toEqual({ churchId: "church-a" });
  });

  it("test 16: a specific user's scope excludes unowned/quarantined links (ownerUserId: null never matches a real userId)", () => {
    const auth = makeAuth({ role: "owner", rawRole: "owner", userId: "owner-1" });
    const scope = buildGivingLinkScope(auth, { kind: "user", userId: "target-9" });
    expect(scope).toEqual({ churchId: "church-a", ownerUserId: "target-9" });
    expect(scope.ownerUserId).not.toBeNull();
  });
});

describe("buildSubscriptionScope", () => {
  it("test 8: forces a FUNDRAISER to their own attributed subscriptions", () => {
    const auth = makeAuth();
    const scope = buildSubscriptionScope(auth, { kind: "organization" });
    expect(scope).toEqual({ churchId: "church-a", attributedUserId: "fundraiser-1" });
  });

  it("uses attributedUserId directly, not createdByUserId or a giving-link join", () => {
    const auth = makeAuth({ role: "owner", rawRole: "owner", userId: "owner-1" });
    const scope = buildSubscriptionScope(auth, { kind: "user", userId: "target-9" });
    expect(scope).toEqual({ churchId: "church-a", attributedUserId: "target-9" });
  });
});

describe("buildPaymentScope", () => {
  it("test 3: forces a FUNDRAISER to only their attributed payments — no GivingLink join", () => {
    const auth = makeAuth();
    const scope = buildPaymentScope(auth, { kind: "organization" });
    expect(scope).toEqual({ churchId: "church-a", attributedUserId: "fundraiser-1" });
  });

  it("test 15: organization scope for an OWNER includes unattributed payments (no attributedUserId filter)", () => {
    const auth = makeAuth({ role: "owner", rawRole: "owner", userId: "owner-1" });
    const scope = buildPaymentScope(auth, { kind: "organization" });
    expect(scope).toEqual({ churchId: "church-a" });
  });

  it("test 16: a specific user's scope excludes unattributed payments", () => {
    const auth = makeAuth({ role: "owner", rawRole: "owner", userId: "owner-1" });
    const scope = buildPaymentScope(auth, { kind: "user", userId: "target-9" });
    expect(scope).toEqual({ churchId: "church-a", attributedUserId: "target-9" });
  });

  it("is synchronous — proves it no longer needs a DB round trip to resolve scope", () => {
    const auth = makeAuth({ role: "owner", rawRole: "owner" });
    const result = buildPaymentScope(auth, { kind: "organization" });
    expect(result).not.toBeInstanceOf(Promise);
  });
});
