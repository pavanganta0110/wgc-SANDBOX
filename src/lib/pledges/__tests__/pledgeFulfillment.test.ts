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

  it("sums pledged/fulfilled across non-canceled pledges and computes percent of goal (no givingLinkId, so no direct donations)", async () => {
    const prismaMock = {
      pledgeCampaign: { findFirst: vi.fn().mockResolvedValue({ goalAmountCents: 100000, givingLinkId: null }) },
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
      totalDirectDonationCents: 0,
      totalRaisedCents: 40000,
      goalAmountCents: 100000,
      percentOfGoal: 40,
    });
  });

  it("returns a null percentOfGoal when the campaign has no goal set", async () => {
    const prismaMock = {
      pledgeCampaign: { findFirst: vi.fn().mockResolvedValue({ goalAmountCents: null, givingLinkId: null }) },
      pledge: { findMany: vi.fn().mockResolvedValue([{ pledgeAmountCents: 5000, fulfilledAmountCents: 0 }]) },
    };
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));

    const { computeCampaignProgress } = await import("../pledgeFulfillment");
    const result = await computeCampaignProgress("church-1", "campaign-1");

    expect(result.percentOfGoal).toBeNull();
  });

  it("BUG FIX: includes direct 'Give now' donations (no pledge) in totalRaisedCents and percentOfGoal", async () => {
    const prismaMock = {
      pledgeCampaign: { findFirst: vi.fn().mockResolvedValue({ goalAmountCents: 100000, givingLinkId: "link-1" }) },
      pledge: { findMany: vi.fn().mockResolvedValue([{ pledgeAmountCents: 30000, fulfilledAmountCents: 30000 }]) },
      payment: {
        findMany: vi.fn().mockResolvedValue([
          { donationAmountCents: 5000, amountCents: 5000, finixTransferId: "t1" },
          { donationAmountCents: 2000, amountCents: 2000, finixTransferId: "t2" },
        ]),
      },
      finixRefundOrReversal: { findMany: vi.fn().mockResolvedValue([]) },
    };
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));

    const { computeCampaignProgress } = await import("../pledgeFulfillment");
    const result = await computeCampaignProgress("church-1", "campaign-1");

    expect(prismaMock.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { churchId: "church-1", givingLinkId: "link-1", pledgeId: null, status: "SUCCEEDED" } })
    );
    expect(result.totalDirectDonationCents).toBe(7000);
    expect(result.totalRaisedCents).toBe(37000); // 30000 fulfilled + 7000 direct
    expect(result.percentOfGoal).toBe(37);
  });

  it("nets out a successful refund against the matching direct donation, via the same finixTransferId join the webhook handler uses", async () => {
    const prismaMock = {
      pledgeCampaign: { findFirst: vi.fn().mockResolvedValue({ goalAmountCents: 100000, givingLinkId: "link-1" }) },
      pledge: { findMany: vi.fn().mockResolvedValue([]) },
      payment: {
        findMany: vi.fn().mockResolvedValue([{ donationAmountCents: 10000, amountCents: 10000, finixTransferId: "t1" }]),
      },
      finixRefundOrReversal: {
        findMany: vi.fn().mockResolvedValue([{ amountCents: 4000 }]),
      },
    };
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));

    const { computeCampaignProgress } = await import("../pledgeFulfillment");
    const result = await computeCampaignProgress("church-1", "campaign-1");

    expect(prismaMock.finixRefundOrReversal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { churchId: "church-1", finixOriginalTransferId: { in: ["t1"] }, state: "SUCCEEDED" } })
    );
    expect(result.totalDirectDonationCents).toBe(6000); // 10000 - 4000 refunded
  });

  it("never returns a negative direct-donation total even if refunds exceed the recorded gross (data anomaly safety floor)", async () => {
    const prismaMock = {
      pledgeCampaign: { findFirst: vi.fn().mockResolvedValue({ goalAmountCents: null, givingLinkId: "link-1" }) },
      pledge: { findMany: vi.fn().mockResolvedValue([]) },
      payment: {
        findMany: vi.fn().mockResolvedValue([{ donationAmountCents: 1000, amountCents: 1000, finixTransferId: "t1" }]),
      },
      finixRefundOrReversal: { findMany: vi.fn().mockResolvedValue([{ amountCents: 5000 }]) },
    };
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));

    const { computeCampaignProgress } = await import("../pledgeFulfillment");
    const result = await computeCampaignProgress("church-1", "campaign-1");

    expect(result.totalDirectDonationCents).toBe(0);
  });
});

describe("computeDirectDonationsCents", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 0 immediately without querying when the campaign has no givingLinkId", async () => {
    const prismaMock = { payment: { findMany: vi.fn() }, finixRefundOrReversal: { findMany: vi.fn() } };
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));

    const { computeDirectDonationsCents } = await import("../pledgeFulfillment");
    const result = await computeDirectDonationsCents("church-1", null);

    expect(result).toBe(0);
    expect(prismaMock.payment.findMany).not.toHaveBeenCalled();
  });

  it("excludes pledge-tagged payments (pledgeId: null filter) so pledge fulfillments are never double-counted", async () => {
    const prismaMock = {
      payment: { findMany: vi.fn().mockResolvedValue([]) },
      finixRefundOrReversal: { findMany: vi.fn() },
    };
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));

    const { computeDirectDonationsCents } = await import("../pledgeFulfillment");
    await computeDirectDonationsCents("church-1", "link-1");

    expect(prismaMock.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ pledgeId: null }) })
    );
  });
});
