import { describe, it, expect, vi, beforeEach } from "vitest";

const settlement = {
  finixSettlementId: "ST1",
  churchId: "church-A",
  feeAmountCents: 300,
  totalAmountCents: 10000,
  netAmountCents: 9200,
};

const transfers = [
  { finixTransferId: "TR1", churchId: "church-A" },
  { finixTransferId: "TR2", churchId: "church-A" },
];
const refunds = [{ amountCents: 200, churchId: "church-A" }];
const fees = [
  { amountCents: 100, churchId: "church-A" },
  { amountCents: 200, churchId: "church-A" },
];
const bankReturns = [{ amountCents: 100, churchId: "church-A" }];
const disputes = [{ amountCents: 150, churchId: "church-A" }];

function makePrismaMock() {
  return {
    finixSettlement: {
      findUnique: vi.fn().mockResolvedValue(settlement),
      update: vi.fn().mockResolvedValue({}),
    },
    finixTransfer: { findMany: vi.fn().mockResolvedValue(transfers) },
    finixRefundOrReversal: { findMany: vi.fn().mockResolvedValue(refunds) },
    finixFee: { findMany: vi.fn().mockResolvedValue(fees) },
    bankReturn: { findMany: vi.fn().mockResolvedValue(bankReturns) },
    finixDispute: { findMany: vi.fn().mockResolvedValue(disputes) },
  };
}

describe("recomputeSettlementAggregates", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("recomputes counts and adjustment totals from linked records", async () => {
    const prismaMock = makePrismaMock();
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    const { recomputeSettlementAggregates } = await import("@/lib/finix/sync/syncSettlements");

    await recomputeSettlementAggregates("ST1");

    expect(prismaMock.finixSettlement.update).toHaveBeenCalledTimes(1);
    const data = prismaMock.finixSettlement.update.mock.calls[0][0].data;

    expect(data.transactionCount).toBe(2);
    expect(data.feeCount).toBe(2);
    expect(data.refundCount).toBe(1);
    expect(data.bankReturnCount).toBe(1);
    expect(data.disputeCount).toBe(1);
    expect(data.refundAmountCents).toBe(200);
    expect(data.returnAmountCents).toBe(100);
    expect(data.disputeAmountCents).toBe(150);

    // knownComponents = fee(300) + refund(200) + return(100) + dispute(150) = 750
    // otherAdjustment = netAmountCents(9200) - (totalAmountCents(10000) - knownComponents(750)) = 9200 - 9250 = -50
    expect(data.otherAdjustmentAmountCents).toBe(-50);
  });

  it("never touches totalAmountCents/netAmountCents/feeAmountCents — those stay Finix's own reported values", async () => {
    const prismaMock = makePrismaMock();
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    const { recomputeSettlementAggregates } = await import("@/lib/finix/sync/syncSettlements");

    await recomputeSettlementAggregates("ST1");

    const data = prismaMock.finixSettlement.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("totalAmountCents");
    expect(data).not.toHaveProperty("netAmountCents");
    expect(data).not.toHaveProperty("feeAmountCents");
  });

  it("does nothing when the settlement no longer exists", async () => {
    const prismaMock = makePrismaMock();
    prismaMock.finixSettlement.findUnique.mockResolvedValue(null);
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    const { recomputeSettlementAggregates } = await import("@/lib/finix/sync/syncSettlements");

    await recomputeSettlementAggregates("MISSING");

    expect(prismaMock.finixSettlement.update).not.toHaveBeenCalled();
  });
});

describe("recomputeSettlementAggregates — tenant isolation", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("scopes every linked-record query by the settlement's own churchId", async () => {
    const prismaMock = makePrismaMock();
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    const { recomputeSettlementAggregates } = await import("@/lib/finix/sync/syncSettlements");

    await recomputeSettlementAggregates("ST1");

    expect(prismaMock.finixTransfer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ churchId: "church-A" }) }),
    );
    expect(prismaMock.finixRefundOrReversal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ churchId: "church-A" }) }),
    );
    expect(prismaMock.finixFee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ churchId: "church-A" }) }),
    );
    expect(prismaMock.bankReturn.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ churchId: "church-A" }) }),
    );
    expect(prismaMock.finixDispute.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ churchId: "church-A" }) }),
    );
  });

  it("scopes by churchId: null (not an unscoped query) when a settlement has no church assigned", async () => {
    const prismaMock = makePrismaMock();
    prismaMock.finixSettlement.findUnique.mockResolvedValue({ ...settlement, churchId: null });
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    const { recomputeSettlementAggregates } = await import("@/lib/finix/sync/syncSettlements");

    await recomputeSettlementAggregates("ST1");

    const call = prismaMock.finixTransfer.findMany.mock.calls[0][0];
    expect(call.where).toHaveProperty("churchId", null);
  });
});

describe("recomputeSettlementAggregates — idempotency", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("produces identical output when run twice against unchanged data", async () => {
    const prismaMock = makePrismaMock();
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    const { recomputeSettlementAggregates } = await import("@/lib/finix/sync/syncSettlements");

    await recomputeSettlementAggregates("ST1");
    await recomputeSettlementAggregates("ST1");

    expect(prismaMock.finixSettlement.update).toHaveBeenCalledTimes(2);
    const firstData = prismaMock.finixSettlement.update.mock.calls[0][0].data;
    const secondData = prismaMock.finixSettlement.update.mock.calls[1][0].data;
    expect(secondData).toEqual(firstData);
  });
});
