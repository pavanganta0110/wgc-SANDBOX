import { describe, it, expect, vi, beforeEach } from "vitest";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV, FINIX_WGC_BILLING_MERCHANT_ID: "MU_wgc_billing_123" };
});

function makePrismaMock(subscriptions: any[], overrides: Record<string, any> = {}) {
  return {
    wgcSubscription: {
      findMany: vi.fn().mockResolvedValue(subscriptions),
      update: vi.fn().mockResolvedValue({}),
    },
    wgcBillingAuditLog: { create: vi.fn().mockResolvedValue({}) },
    ...overrides,
  };
}

async function loadModule(prismaMock: any, getSubscription = vi.fn()) {
  vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
  vi.doMock("@/lib/finix/client", () => ({ finixClient: { getSubscription } }));
  return import("@/lib/billing/subscriptionReconciliation");
}

describe("reconcileWgcSubscriptions — never creates a new charge or subscription", () => {
  it("only reads Finix and updates local fields — never calls a creation method", async () => {
    const sub = { id: "sub-1", organizationId: "church-A", finixSubscriptionId: "fx_1", finixBillingMerchantId: "MU_wgc_billing_123", status: "TRIALING", trialEndsAt: new Date("2027-07-01"), nextChargeAt: new Date("2027-07-01"), pastDueAt: null, createdAt: new Date() };
    const prismaMock = makePrismaMock([sub]);
    const getSubscription = vi.fn().mockResolvedValue({ state: "ACTIVE", subscription_phase: "TRIAL", first_charge_at: "2027-07-01T00:00:00Z", next_billing_date: { year: 2027, month: 7, day: 1 } });
    const mod = await loadModule(prismaMock, getSubscription);

    const result = await mod.reconcileWgcSubscriptions();

    expect(getSubscription).toHaveBeenCalledWith("fx_1");
    expect(result.scannedCount).toBe(1);
    expect(result.errorCount).toBe(0);
    // No creation calls exist anywhere on the mock — proves nothing new was ever created.
    expect((prismaMock.wgcSubscription as any).create).toBeUndefined();
  });

  it("updates locally-stored dates when they drift from Finix's returned values", async () => {
    const sub = { id: "sub-1", organizationId: "church-A", finixSubscriptionId: "fx_1", finixBillingMerchantId: "MU_wgc_billing_123", status: "TRIALING", trialEndsAt: new Date("2027-06-01"), nextChargeAt: new Date("2027-06-01"), pastDueAt: null, createdAt: new Date() };
    const prismaMock = makePrismaMock([sub]);
    const getSubscription = vi.fn().mockResolvedValue({ state: "ACTIVE", subscription_phase: "TRIAL", first_charge_at: "2027-07-01T00:00:00Z", next_billing_date: { year: 2027, month: 7, day: 1 } });
    const mod = await loadModule(prismaMock, getSubscription);

    const result = await mod.reconcileWgcSubscriptions();

    expect(result.updatedCount).toBe(1);
    expect(prismaMock.wgcSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "sub-1" }, data: expect.objectContaining({ trialEndsAt: new Date("2027-07-01T00:00:00Z") }) }),
    );
  });
});

describe("reconcileWgcSubscriptions — flags critical issues, never silently repairs them", () => {
  it("flags a merchant-routing mismatch instead of correcting it", async () => {
    const sub = { id: "sub-1", organizationId: "church-A", finixSubscriptionId: "fx_1", finixBillingMerchantId: "MU_WRONG_MERCHANT", status: "ACTIVE", trialEndsAt: null, nextChargeAt: null, pastDueAt: null, createdAt: new Date() };
    const prismaMock = makePrismaMock([sub]);
    const getSubscription = vi.fn().mockResolvedValue({ state: "ACTIVE" });
    const mod = await loadModule(prismaMock, getSubscription);

    const result = await mod.reconcileWgcSubscriptions();

    const flag = result.flags.find((f) => f.type === "MERCHANT_ROUTING_MISMATCH");
    expect(flag).toBeDefined();
    expect(flag?.organizationId).toBe("church-A");
    // The stored (wrong) merchant id is never overwritten by this function.
    expect(prismaMock.wgcSubscription.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ finixBillingMerchantId: expect.anything() }) }),
    );
  });

  it("flags a subscription stuck INCOMPLETE with no Finix id past the timeout window", async () => {
    const sub = {
      id: "sub-1",
      organizationId: "church-A",
      finixSubscriptionId: null,
      finixBillingMerchantId: "MU_wgc_billing_123",
      status: "INCOMPLETE",
      trialEndsAt: null,
      nextChargeAt: null,
      pastDueAt: null,
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2h old
    };
    const prismaMock = makePrismaMock([sub]);
    const mod = await loadModule(prismaMock);

    const result = await mod.reconcileWgcSubscriptions();

    expect(result.flags.some((f) => f.type === "MISSING_FINIX_ID" && f.subscriptionId === "sub-1")).toBe(true);
  });

  it("flags a subscription that has been PAST_DUE for more than 30 days", async () => {
    const sub = {
      id: "sub-1",
      organizationId: "church-A",
      finixSubscriptionId: "fx_1",
      finixBillingMerchantId: "MU_wgc_billing_123",
      status: "PAST_DUE",
      trialEndsAt: null,
      nextChargeAt: null,
      pastDueAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
    };
    const prismaMock = makePrismaMock([sub]);
    const getSubscription = vi.fn().mockResolvedValue({ state: "ACTIVE" });
    const mod = await loadModule(prismaMock, getSubscription);

    const result = await mod.reconcileWgcSubscriptions();

    expect(result.flags.some((f) => f.type === "STALE_PAST_DUE")).toBe(true);
  });

  it("continues reconciling other subscriptions when one Finix call errors, and reports the error count", async () => {
    const subs = [
      { id: "sub-1", organizationId: "church-A", finixSubscriptionId: "fx_1", finixBillingMerchantId: "MU_wgc_billing_123", status: "ACTIVE", trialEndsAt: null, nextChargeAt: null, pastDueAt: null, createdAt: new Date() },
      { id: "sub-2", organizationId: "church-B", finixSubscriptionId: "fx_2", finixBillingMerchantId: "MU_wgc_billing_123", status: "ACTIVE", trialEndsAt: null, nextChargeAt: null, pastDueAt: null, createdAt: new Date() },
    ];
    const prismaMock = makePrismaMock(subs);
    const getSubscription = vi.fn().mockRejectedValueOnce(new Error("Finix timeout")).mockResolvedValueOnce({ state: "ACTIVE" });
    const mod = await loadModule(prismaMock, getSubscription);

    const result = await mod.reconcileWgcSubscriptions();

    expect(result.errorCount).toBe(1);
    expect(result.scannedCount).toBe(2);
  });
});
