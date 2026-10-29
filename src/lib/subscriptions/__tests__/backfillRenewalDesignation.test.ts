import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  finixSubscription: { findMany: vi.fn() },
  payment: { count: vi.fn(), updateMany: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

const subs = [
  { finixSubscriptionId: "SUB_1", churchId: "church-a", fundId: "fund1", fundName: "Missions" },
  { finixSubscriptionId: "SUB_2", churchId: "church-a", fundId: "fund2", fundName: "Building" },
];

describe("backfillRenewalDesignation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockPrisma.finixSubscription.findMany.mockResolvedValue(subs);
  });

  it("only counts in a dry run and writes nothing", async () => {
    mockPrisma.payment.count.mockResolvedValueOnce(3).mockResolvedValueOnce(2);
    const { backfillRenewalDesignation } = await import("../backfillRenewalDesignation");

    const result = await backfillRenewalDesignation({ apply: false });

    expect(result).toEqual({ dryRun: true, subscriptionsWithFund: 2, paymentsAffected: 5 });
    expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
  });

  it("fills each subscription's fund only onto its payments that have none, within the same church", async () => {
    mockPrisma.payment.updateMany.mockResolvedValueOnce({ count: 3 }).mockResolvedValueOnce({ count: 2 });
    const { backfillRenewalDesignation } = await import("../backfillRenewalDesignation");

    const result = await backfillRenewalDesignation({ apply: true });

    expect(result).toEqual({ dryRun: false, subscriptionsWithFund: 2, paymentsAffected: 5 });
    expect(mockPrisma.payment.updateMany).toHaveBeenNthCalledWith(1, {
      where: { finixSubscriptionId: "SUB_1", fundId: null, churchId: "church-a" },
      data: { fundId: "fund1", fundName: "Missions" },
    });
    expect(mockPrisma.payment.updateMany).toHaveBeenNthCalledWith(2, {
      where: { finixSubscriptionId: "SUB_2", fundId: null, churchId: "church-a" },
      data: { fundId: "fund2", fundName: "Building" },
    });
  });

  it("never selects payments that already have a fund, so it cannot overwrite a designation", async () => {
    mockPrisma.payment.updateMany.mockResolvedValue({ count: 0 });
    const { backfillRenewalDesignation } = await import("../backfillRenewalDesignation");

    await backfillRenewalDesignation({ apply: true });

    for (const call of mockPrisma.payment.updateMany.mock.calls) {
      expect(call[0].where.fundId).toBeNull();
    }
  });

  it("limits the subscription scan to one church when asked, and only subscriptions that have a fund", async () => {
    mockPrisma.payment.count.mockResolvedValue(0);
    const { backfillRenewalDesignation } = await import("../backfillRenewalDesignation");

    await backfillRenewalDesignation({ apply: false, churchId: "church-a" });

    expect(mockPrisma.finixSubscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { fundId: { not: null }, churchId: "church-a" } })
    );
  });

  it("is a no-op when no subscription has a fund", async () => {
    mockPrisma.finixSubscription.findMany.mockResolvedValue([]);
    const { backfillRenewalDesignation } = await import("../backfillRenewalDesignation");

    expect(await backfillRenewalDesignation({ apply: true })).toEqual({ dryRun: false, subscriptionsWithFund: 0, paymentsAffected: 0 });
    expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
  });
});
