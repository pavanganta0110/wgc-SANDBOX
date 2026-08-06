import { describe, it, expect, vi, beforeEach } from "vitest";

function makePrismaMock(overrides: Record<string, any> = {}) {
  return {
    wgcSubscription: {
      findUnique: vi.fn().mockResolvedValue({ id: "sub-1", organizationId: "church-A", finixSubscriptionId: "fx_sub_1", status: "ACTIVE" }),
      update: vi.fn().mockResolvedValue({}),
    },
    church: { findUnique: vi.fn().mockResolvedValue({ name: "Test Church" }) },
    wgcBillingAuditLog: { create: vi.fn().mockResolvedValue({}) },
    billingEmailLog: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "log-1" }), update: vi.fn().mockResolvedValue({}) },
    ...overrides,
  };
}

async function loadModule(prismaMock: any, cancelSubscription = vi.fn().mockResolvedValue({})) {
  vi.resetModules();
  vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
  vi.doMock("@/lib/finix/client", () => ({ finixClient: { cancelSubscription } }));
  vi.doMock("@/lib/email", () => ({ sendWgcEmail: vi.fn().mockResolvedValue({ success: true }) }));
  return { mod: await import("@/lib/billing/wgcSubscriptionCancellation"), cancelSubscription };
}

describe("cancelWgcSubscription", () => {
  it("cancels the correct Finix subscription and records who canceled it", async () => {
    const prismaMock = makePrismaMock();
    const { mod, cancelSubscription } = await loadModule(prismaMock);

    const result = await mod.cancelWgcSubscription({ organizationId: "church-A", actorUserId: "user-1", actorEmail: "owner@test.com" });

    expect(cancelSubscription).toHaveBeenCalledWith("fx_sub_1");
    expect(prismaMock.wgcSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "CANCELED", canceledByUserId: "user-1" }) }),
    );
    expect(result.canceledAt).toBeInstanceOf(Date);
  });

  it("does NOT report success if the Finix cancellation call fails, and does not mutate the subscription row", async () => {
    const prismaMock = makePrismaMock();
    const { mod } = await loadModule(prismaMock, vi.fn().mockRejectedValue(new Error("Finix 500")));

    await expect(mod.cancelWgcSubscription({ organizationId: "church-A", actorUserId: "user-1", actorEmail: "owner@test.com" })).rejects.toThrow();
    expect(prismaMock.wgcSubscription.update).not.toHaveBeenCalled();
  });

  it("refuses to cancel a subscription that doesn't belong to the given organization", async () => {
    const prismaMock = makePrismaMock({
      wgcSubscription: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() },
    });
    const { mod, cancelSubscription } = await loadModule(prismaMock);

    await expect(mod.cancelWgcSubscription({ organizationId: "church-B", actorUserId: "user-1", actorEmail: "x@test.com" })).rejects.toThrow();
    expect(cancelSubscription).not.toHaveBeenCalled();
  });

  it("refuses to cancel an already-canceled subscription a second time", async () => {
    const prismaMock = makePrismaMock({
      wgcSubscription: { findUnique: vi.fn().mockResolvedValue({ id: "sub-1", organizationId: "church-A", finixSubscriptionId: "fx_sub_1", status: "CANCELED" }), update: vi.fn() },
    });
    const { mod, cancelSubscription } = await loadModule(prismaMock);

    await expect(mod.cancelWgcSubscription({ organizationId: "church-A", actorUserId: "user-1", actorEmail: "x@test.com" })).rejects.toThrow();
    expect(cancelSubscription).not.toHaveBeenCalled();
  });
});
