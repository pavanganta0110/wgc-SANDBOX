import { describe, it, expect, vi, beforeEach } from "vitest";

describe("computePledgeFulfillment", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("marks a pledge FULFILLED once linked fulfillment amounts meet the pledged amount", async () => {
    const updateMock = vi.fn().mockResolvedValue({});
    const prismaMock = {
      pledge: {
        findUnique: vi.fn().mockResolvedValue({ id: "p1", pledgeAmountCents: 10000, status: "PROMISED", fulfilledAt: null }),
        update: updateMock,
      },
      externalDonation: { findMany: vi.fn().mockResolvedValue([{ donationAmountCents: 10000 }]) },
      payment: { findMany: vi.fn().mockResolvedValue([]) },
    };
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));

    const { computePledgeFulfillment } = await import("../pledgeFulfillment");
    await computePledgeFulfillment("p1");

    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: expect.objectContaining({ fulfilledAmountCents: 10000, status: "FULFILLED" }),
    });
  });

  it("marks a pledge PARTIALLY_FULFILLED when fulfillment is less than the pledged amount", async () => {
    const updateMock = vi.fn().mockResolvedValue({});
    const prismaMock = {
      pledge: {
        findUnique: vi.fn().mockResolvedValue({ id: "p1", pledgeAmountCents: 10000, status: "PROMISED", fulfilledAt: null }),
        update: updateMock,
      },
      externalDonation: { findMany: vi.fn().mockResolvedValue([{ donationAmountCents: 4000 }]) },
      payment: { findMany: vi.fn().mockResolvedValue([]) },
    };
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));

    const { computePledgeFulfillment } = await import("../pledgeFulfillment");
    await computePledgeFulfillment("p1");

    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: expect.objectContaining({ fulfilledAmountCents: 4000, status: "PARTIALLY_FULFILLED" }),
    });
  });

  it("does nothing for an already-canceled pledge", async () => {
    const updateMock = vi.fn();
    const prismaMock = {
      pledge: {
        findUnique: vi.fn().mockResolvedValue({ id: "p1", pledgeAmountCents: 10000, status: "CANCELED", fulfilledAt: null }),
        update: updateMock,
      },
      externalDonation: { findMany: vi.fn() },
      payment: { findMany: vi.fn() },
    };
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));

    const { computePledgeFulfillment } = await import("../pledgeFulfillment");
    await computePledgeFulfillment("p1");

    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe("computeCampaignProgress", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("sums pledged/fulfilled across non-canceled pledges and computes percent of goal", async () => {
    const prismaMock = {
      pledgeCampaign: { findFirst: vi.fn().mockResolvedValue({ goalAmountCents: 100000 }) },
      pledge: {
        findMany: vi.fn().mockResolvedValue([
          { pledgeAmountCents: 30000, fulfilledAmountCents: 30000 },
          { pledgeAmountCents: 20000, fulfilledAmountCents: 10000 },
        ]),
      },
    };
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));

    const { computeCampaignProgress } = await import("../pledgeFulfillment");
    const result = await computeCampaignProgress("church-1", "campaign-1");

    expect(result).toEqual({
      pledgeCount: 2,
      totalPledgedCents: 50000,
      totalFulfilledCents: 40000,
      goalAmountCents: 100000,
      percentOfGoal: 40,
    });
  });

  it("returns a null percentOfGoal when the campaign has no goal set", async () => {
    const prismaMock = {
      pledgeCampaign: { findFirst: vi.fn().mockResolvedValue({ goalAmountCents: null }) },
      pledge: { findMany: vi.fn().mockResolvedValue([{ pledgeAmountCents: 5000, fulfilledAmountCents: 0 }]) },
    };
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));

    const { computeCampaignProgress } = await import("../pledgeFulfillment");
    const result = await computeCampaignProgress("church-1", "campaign-1");

    expect(result.percentOfGoal).toBeNull();
  });
});
