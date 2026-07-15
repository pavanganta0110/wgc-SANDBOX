import { describe, it, expect, vi, beforeEach } from "vitest";

describe("backfillTransferSubscriptionId", () => {
  beforeEach(() => vi.resetModules());

  it("extracts finixSubscriptionId from already-stored rawJsonRedacted without any new API calls", async () => {
    const updateMock = vi.fn();
    const prismaMock = {
      finixTransfer: {
        findMany: vi.fn().mockResolvedValue([
          { id: "t1", rawJsonRedacted: { subscription: "fx-sub-1" } },
          { id: "t2", rawJsonRedacted: { subscription: null } },
          { id: "t3", rawJsonRedacted: null },
        ]),
        update: updateMock,
      },
    };
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    const { backfillTransferSubscriptionId } = await import("@/lib/subscriptions/subscriptionBackfill");

    const result = await backfillTransferSubscriptionId("church-A");
    expect(result).toEqual({ scanned: 3, updated: 1, noRawPayload: 2 });
    expect(updateMock).toHaveBeenCalledWith({ where: { id: "t1" }, data: { finixSubscriptionId: "fx-sub-1" } });
  });
});

describe("backfillSubscriptionDonorId", () => {
  beforeEach(() => vi.resetModules());

  it("resolves donorId from the already-linked instrument snapshot", async () => {
    const updateMock = vi.fn();
    const prismaMock = {
      finixSubscription: {
        findMany: vi.fn().mockResolvedValue([{ id: "s1", finixPaymentInstrumentId: "IN1" }]),
        update: updateMock,
      },
      finixPaymentInstrumentSnapshot: {
        findUnique: vi.fn().mockResolvedValue({ donorId: "D1" }),
      },
    };
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    const { backfillSubscriptionDonorId } = await import("@/lib/subscriptions/subscriptionBackfill");

    const result = await backfillSubscriptionDonorId("church-A");
    expect(result).toEqual({ scanned: 1, updated: 1, noInstrumentDonor: 0 });
    expect(updateMock).toHaveBeenCalledWith({ where: { id: "s1" }, data: { donorId: "D1" } });
  });

  it("does not guess a donor when the instrument itself has none", async () => {
    const updateMock = vi.fn();
    const prismaMock = {
      finixSubscription: {
        findMany: vi.fn().mockResolvedValue([{ id: "s1", finixPaymentInstrumentId: "IN1" }]),
        update: updateMock,
      },
      finixPaymentInstrumentSnapshot: {
        findUnique: vi.fn().mockResolvedValue({ donorId: null }),
      },
    };
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    const { backfillSubscriptionDonorId } = await import("@/lib/subscriptions/subscriptionBackfill");

    const result = await backfillSubscriptionDonorId("church-A");
    expect(result).toEqual({ scanned: 1, updated: 0, noInstrumentDonor: 1 });
    expect(updateMock).not.toHaveBeenCalled();
  });
});
