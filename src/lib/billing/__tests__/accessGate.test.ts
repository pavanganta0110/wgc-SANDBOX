import { describe, it, expect, vi, beforeEach } from "vitest";

function makePrismaMock(overrides: Record<string, any> = {}) {
  return {
    church: { findUnique: vi.fn().mockResolvedValue({ billingSetupStatus: null, status: "ACTIVE" }) },
    wgcSubscription: { findUnique: vi.fn().mockResolvedValue(null) },
    ...overrides,
  };
}

async function loadModule(prismaMock: any) {
  vi.resetModules();
  vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
  return import("@/lib/billing/accessGate");
}

describe("resolveOrgAccessState", () => {
  it("a grandfathered organization (billingSetupStatus null) is never gated", async () => {
    const prismaMock = makePrismaMock();
    const mod = await loadModule(prismaMock);
    const result = await mod.resolveOrgAccessState("church-A");
    expect(result.state).toBe("NO_GATE");
    expect(result.fullAccessAllowed).toBe(true);
  });

  it("APPROVED_BILLING_REQUIRED with no Finix subscription blocks full access", async () => {
    const prismaMock = makePrismaMock({
      church: { findUnique: vi.fn().mockResolvedValue({ billingSetupStatus: "APPROVED_BILLING_REQUIRED", status: "ACTIVE" }) },
      wgcSubscription: { findUnique: vi.fn().mockResolvedValue(null) },
    });
    const mod = await loadModule(prismaMock);
    const result = await mod.resolveOrgAccessState("church-A");
    expect(result.state).toBe("APPROVED_BILLING_REQUIRED");
    expect(result.fullAccessAllowed).toBe(false);
  });

  it("a TRIALING subscription allows full access", async () => {
    const prismaMock = makePrismaMock({
      church: { findUnique: vi.fn().mockResolvedValue({ billingSetupStatus: "BILLING_ACTIVE", status: "ACTIVE" }) },
      wgcSubscription: { findUnique: vi.fn().mockResolvedValue({ status: "TRIALING", finixSubscriptionId: "fx_1", gracePeriodEndsAt: null }) },
    });
    const mod = await loadModule(prismaMock);
    const result = await mod.resolveOrgAccessState("church-A");
    expect(result.state).toBe("TRIALING_OR_ACTIVE");
    expect(result.fullAccessAllowed).toBe(true);
  });

  it("PAST_DUE within the grace period still allows full access, with a warning state", async () => {
    const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const prismaMock = makePrismaMock({
      church: { findUnique: vi.fn().mockResolvedValue({ billingSetupStatus: "BILLING_ACTIVE", status: "ACTIVE" }) },
      wgcSubscription: { findUnique: vi.fn().mockResolvedValue({ status: "PAST_DUE", finixSubscriptionId: "fx_1", gracePeriodEndsAt: future }) },
    });
    const mod = await loadModule(prismaMock);
    const result = await mod.resolveOrgAccessState("church-A");
    expect(result.state).toBe("PAST_DUE_IN_GRACE");
    expect(result.fullAccessAllowed).toBe(true);
  });

  it("PAST_DUE after the grace period restricts access", async () => {
    const past = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const prismaMock = makePrismaMock({
      church: { findUnique: vi.fn().mockResolvedValue({ billingSetupStatus: "BILLING_ACTIVE", status: "ACTIVE" }) },
      wgcSubscription: { findUnique: vi.fn().mockResolvedValue({ status: "PAST_DUE", finixSubscriptionId: "fx_1", gracePeriodEndsAt: past }) },
    });
    const mod = await loadModule(prismaMock);
    const result = await mod.resolveOrgAccessState("church-A");
    expect(result.state).toBe("PAST_DUE_EXPIRED");
    expect(result.fullAccessAllowed).toBe(false);
  });

  it("a CANCELED subscription restricts access", async () => {
    const prismaMock = makePrismaMock({
      church: { findUnique: vi.fn().mockResolvedValue({ billingSetupStatus: "BILLING_ACTIVE", status: "ACTIVE" }) },
      wgcSubscription: { findUnique: vi.fn().mockResolvedValue({ status: "CANCELED", finixSubscriptionId: "fx_1" }) },
    });
    const mod = await loadModule(prismaMock);
    const result = await mod.resolveOrgAccessState("church-A");
    expect(result.state).toBe("CANCELED");
    expect(result.fullAccessAllowed).toBe(false);
  });

  it("a SUSPENDED organization restricts access regardless of subscription state", async () => {
    const prismaMock = makePrismaMock({
      church: { findUnique: vi.fn().mockResolvedValue({ billingSetupStatus: "BILLING_ACTIVE", status: "SUSPENDED" }) },
      wgcSubscription: { findUnique: vi.fn().mockResolvedValue({ status: "ACTIVE", finixSubscriptionId: "fx_1" }) },
    });
    const mod = await loadModule(prismaMock);
    const result = await mod.resolveOrgAccessState("church-A");
    expect(result.state).toBe("SUSPENDED");
    expect(result.fullAccessAllowed).toBe(false);
  });
});

describe("requireMerchantSession — server-side billing gate enforcement", () => {
  beforeEach(() => vi.resetModules());

  it("throws BillingAccessRestrictedError for a restricted org when the gate is not explicitly bypassed — a page cannot access data by entering its URL directly", async () => {
    vi.resetModules();
    const userRow = {
      id: "user-1",
      email: "owner@test.com",
      churchId: "church-A",
      role: "owner",
      disabledAt: null,
      authVersion: 1,
      permissionsJson: null,
    };
    vi.doMock("@/lib/prisma", () => ({
      prisma: {
        user: { findUnique: vi.fn().mockResolvedValue(userRow) },
        church: { findUnique: vi.fn().mockResolvedValue({ billingSetupStatus: "APPROVED_BILLING_REQUIRED", status: "ACTIVE" }) },
        wgcSubscription: { findUnique: vi.fn().mockResolvedValue(null) },
      },
    }));
    vi.doMock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "fake-token" }) }) }));
    vi.doMock("@/lib/auth/session", () => ({ verifySessionToken: () => ({ userId: "user-1", authVersion: 1 }) }));

    const { requireMerchantSession } = await import("@/lib/auth/requireMerchantSession");
    const { BillingAccessRestrictedError } = await import("@/lib/auth/errors");

    await expect(requireMerchantSession()).rejects.toThrow(BillingAccessRestrictedError);
  });

  it("succeeds for the same restricted org when allowRestrictedAccess=true (the billing-setup page itself)", async () => {
    vi.resetModules();
    const userRow = {
      id: "user-1",
      email: "owner@test.com",
      churchId: "church-A",
      role: "owner",
      disabledAt: null,
      authVersion: 1,
      permissionsJson: null,
    };
    vi.doMock("@/lib/prisma", () => ({
      prisma: {
        user: { findUnique: vi.fn().mockResolvedValue(userRow) },
        church: { findUnique: vi.fn().mockResolvedValue({ billingSetupStatus: "APPROVED_BILLING_REQUIRED", status: "ACTIVE" }) },
        wgcSubscription: { findUnique: vi.fn().mockResolvedValue(null) },
      },
    }));
    vi.doMock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "fake-token" }) }) }));
    vi.doMock("@/lib/auth/session", () => ({ verifySessionToken: () => ({ userId: "user-1", authVersion: 1 }) }));

    const { requireMerchantSession } = await import("@/lib/auth/requireMerchantSession");
    const auth = await requireMerchantSession(true);
    expect(auth.orgAccessState).toBe("APPROVED_BILLING_REQUIRED");
  });
});
