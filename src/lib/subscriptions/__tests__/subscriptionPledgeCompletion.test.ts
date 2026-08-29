import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCancelSubscription = vi.fn();
vi.mock("@/lib/finix/client", () => ({
  finixClient: {
    cancelSubscription: mockCancelSubscription,
  },
}));

describe("checkPledgeCompletions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("cancels a pledge subscription once lifetime collected reaches the total", async () => {
    const updateManyMock = vi.fn().mockResolvedValue({ count: 1 });
    const prismaMock = {
      finixSubscription: {
        findMany: vi.fn().mockResolvedValue([
          { id: "sub-1", finixSubscriptionId: "fx-1", totalAmountCents: 60000, installmentsTotal: 12 },
        ]),
        updateMany: updateManyMock,
      },
      finixTransfer: {
        findMany: vi.fn().mockResolvedValue([
          { finixSubscriptionId: "fx-1", amountCents: 30000 },
          { finixSubscriptionId: "fx-1", amountCents: 30000 },
        ]),
      },
    };
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    mockCancelSubscription.mockResolvedValue({ id: "fx-1", state: "CANCELED" });

    const { checkPledgeCompletions } = await import("../subscriptionPledgeCompletion");
    const result = await checkPledgeCompletions("church-1");

    expect(result).toEqual({ checked: 1, completed: 1 });
    expect(mockCancelSubscription).toHaveBeenCalledWith("fx-1");
    expect(updateManyMock).toHaveBeenCalledWith({
      where: { id: "sub-1", canceledAt: null },
      data: expect.objectContaining({ cancelReason: "PLEDGE_FULFILLED", installmentsCompleted: 2, state: "CANCELED" }),
    });
  });

  it("leaves a pledge subscription alone when the total has not yet been collected", async () => {
    const updateManyMock = vi.fn();
    const prismaMock = {
      finixSubscription: {
        findMany: vi.fn().mockResolvedValue([
          { id: "sub-1", finixSubscriptionId: "fx-1", totalAmountCents: 60000, installmentsTotal: 12 },
        ]),
        updateMany: updateManyMock,
      },
      finixTransfer: {
        findMany: vi.fn().mockResolvedValue([{ finixSubscriptionId: "fx-1", amountCents: 5000 }]),
      },
    };
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));

    const { checkPledgeCompletions } = await import("../subscriptionPledgeCompletion");
    const result = await checkPledgeCompletions("church-1");

    expect(result).toEqual({ checked: 1, completed: 0 });
    expect(mockCancelSubscription).not.toHaveBeenCalled();
    expect(updateManyMock).not.toHaveBeenCalled();
  });

  it("completes via installment count even if the dollar total hasn't technically been reached (e.g. a discounted final installment)", async () => {
    const updateManyMock = vi.fn().mockResolvedValue({ count: 1 });
    const prismaMock = {
      finixSubscription: {
        findMany: vi.fn().mockResolvedValue([
          { id: "sub-1", finixSubscriptionId: "fx-1", totalAmountCents: 60000, installmentsTotal: 2 },
        ]),
        updateMany: updateManyMock,
      },
      finixTransfer: {
        findMany: vi.fn().mockResolvedValue([
          { finixSubscriptionId: "fx-1", amountCents: 25000 },
          { finixSubscriptionId: "fx-1", amountCents: 25000 },
        ]),
      },
    };
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    mockCancelSubscription.mockResolvedValue({ id: "fx-1", state: "CANCELED" });

    const { checkPledgeCompletions } = await import("../subscriptionPledgeCompletion");
    const result = await checkPledgeCompletions("church-1");

    expect(result).toEqual({ checked: 1, completed: 1 });
  });

  it("returns immediately with no queries when there are no pledge subscriptions", async () => {
    const findManyTransfers = vi.fn();
    const prismaMock = {
      finixSubscription: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn(),
      },
      finixTransfer: { findMany: findManyTransfers },
    };
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));

    const { checkPledgeCompletions } = await import("../subscriptionPledgeCompletion");
    const result = await checkPledgeCompletions("church-1");

    expect(result).toEqual({ checked: 0, completed: 0 });
    expect(findManyTransfers).not.toHaveBeenCalled();
  });
});
