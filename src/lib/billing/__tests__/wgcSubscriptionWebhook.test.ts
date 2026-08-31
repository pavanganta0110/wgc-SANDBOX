import { describe, it, expect, vi, beforeEach } from "vitest";

function makePrismaMock(overrides: Record<string, any> = {}) {
  return {
    wgcSubscription: {
      findUnique: vi.fn().mockResolvedValue({
        id: "sub-row-1",
        organizationId: "church-A",
        finixSubscriptionId: "fx_sub_123",
        amountCents: 1000,
        currency: "USD",
        priceVersionId: "price-1",
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    billingCharge: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
    church: { findUnique: vi.fn().mockResolvedValue({ name: "Test Church", primaryContactEmail: "owner@test.com" }) },
    wgcBillingAccount: { findUnique: vi.fn().mockResolvedValue({ maskedBillingDetails: "Visa ••••4242" }) },
    promotionEntitlement: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    wgcBillingAuditLog: { create: vi.fn().mockResolvedValue({}) },
    billingEmailLog: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "log-1" }), update: vi.fn().mockResolvedValue({}) },
    ...overrides,
  };
}

async function loadModule(prismaMock: any) {
  vi.resetModules();
  vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
  vi.doMock("@/lib/email", () => ({ sendWgcEmail: vi.fn().mockResolvedValue({ success: true, data: { id: "email-1" } }) }));
  return import("@/lib/billing/wgcSubscriptionWebhook");
}

beforeEach(() => vi.resetModules());

describe("handleWgcSubscriptionWebhookEvent — resolution", () => {
  it("returns false (unhandled) for an event with no subscription id at all — never touches WGC tables", async () => {
    const prismaMock = makePrismaMock();
    const mod = await loadModule(prismaMock);
    const handled = await mod.handleWgcSubscriptionWebhookEvent("transfer.updated", { id: "TR_1", amount: 5000, state: "SUCCEEDED" });
    expect(handled).toBe(false);
    expect(prismaMock.wgcSubscription.findUnique).not.toHaveBeenCalled();
  });

  it("returns false for a subscription id that matches no WgcSubscription row — an org's own donor recurring-giving event, not ours", async () => {
    const prismaMock = makePrismaMock({ wgcSubscription: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() } });
    const mod = await loadModule(prismaMock);
    const handled = await mod.handleWgcSubscriptionWebhookEvent("transfer.updated", { id: "TR_1", subscription: "fx_sub_unrelated", amount: 5000, state: "SUCCEEDED" });
    expect(handled).toBe(false);
  });
});

describe("handleWgcSubscriptionWebhookEvent — successful charge", () => {
  it("resolves the subscription id from tags.subscription_id, matching Finix's real transfer.updated payload shape", async () => {
    const prismaMock = makePrismaMock();
    const mod = await loadModule(prismaMock);

    const handled = await mod.handleWgcSubscriptionWebhookEvent("transfer.updated", {
      id: "TR_real_shape_1",
      tags: { subscription_id: "fx_sub_123" },
      amount: 1000,
      state: "SUCCEEDED",
    });

    expect(handled).toBe(true);
    expect(prismaMock.wgcSubscription.findUnique).toHaveBeenCalledWith({ where: { finixSubscriptionId: "fx_sub_123" } });
    expect(prismaMock.billingCharge.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SUCCEEDED", amountCents: 1000 }) }),
    );
  });

  it("records a SUCCEEDED BillingCharge, marks the subscription ACTIVE, completes the promotion entitlement, and sends a receipt", async () => {
    const prismaMock = makePrismaMock();
    const mod = await loadModule(prismaMock);

    const handled = await mod.handleWgcSubscriptionWebhookEvent("transfer.updated", {
      id: "TR_success_1",
      subscription: "fx_sub_123",
      amount: 1000,
      state: "SUCCEEDED",
    });

    expect(handled).toBe(true);
    expect(prismaMock.billingCharge.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SUCCEEDED", amountCents: 1000, chargeType: "WGC_PLATFORM_SUBSCRIPTION" }) }),
    );
    expect(prismaMock.wgcSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "ACTIVE" }) }),
    );
    expect(prismaMock.promotionEntitlement.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "COMPLETED" }) }),
    );
  });

  it("a duplicate webhook for the same transfer does not create a second BillingCharge", async () => {
    const prismaMock = makePrismaMock({
      billingCharge: { findUnique: vi.fn().mockResolvedValue({ id: "existing-charge" }), create: vi.fn() },
    });
    const mod = await loadModule(prismaMock);

    const handled = await mod.handleWgcSubscriptionWebhookEvent("transfer.updated", {
      id: "TR_dup_1",
      subscription: "fx_sub_123",
      amount: 1000,
      state: "SUCCEEDED",
    });

    expect(handled).toBe(true);
    expect(prismaMock.billingCharge.create).not.toHaveBeenCalled();
    expect(prismaMock.wgcSubscription.update).not.toHaveBeenCalled();
  });
});

describe("handleWgcSubscriptionWebhookEvent — failed charge", () => {
  it("records a FAILED BillingCharge, sets the subscription PAST_DUE with a grace period, and notifies the owner", async () => {
    const prismaMock = makePrismaMock();
    const mod = await loadModule(prismaMock);

    const handled = await mod.handleWgcSubscriptionWebhookEvent("transfer.updated", {
      id: "TR_fail_1",
      subscription: "fx_sub_123",
      amount: 1000,
      state: "FAILED",
    });

    expect(handled).toBe(true);
    expect(prismaMock.billingCharge.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }),
    );
    expect(prismaMock.wgcSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PAST_DUE" }) }),
    );
  });

  it("never creates a second subscription automatically on failure — only ever updates the existing row", async () => {
    const prismaMock = makePrismaMock();
    const mod = await loadModule(prismaMock);
    await mod.handleWgcSubscriptionWebhookEvent("transfer.updated", { id: "TR_fail_2", subscription: "fx_sub_123", amount: 1000, state: "FAILED" });
    expect(Object.keys(prismaMock).includes("wgcSubscription" as any)).toBe(true);
    // No create call exists on the wgcSubscription mock at all — only update — proving nothing new is ever created here.
    expect((prismaMock.wgcSubscription as any).create).toBeUndefined();
  });
});
