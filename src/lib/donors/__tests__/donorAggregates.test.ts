import { describe, it, expect, vi, beforeEach } from "vitest";

function makePrismaMock(overrides: Record<string, any> = {}) {
  return {
    finixPaymentInstrumentSnapshot: {
      findMany: vi.fn().mockResolvedValue([{ finixPaymentInstrumentId: "IN1", donorId: "D1" }]),
    },
    finixTransfer: {
      findMany: vi.fn().mockResolvedValue([
        { finixTransferId: "TR1", finixPaymentInstrumentId: "IN1", paymentId: null, amountCents: 10000, state: "SUCCEEDED", createdAtFinix: new Date("2026-01-01") },
        { finixTransferId: "TR2", finixPaymentInstrumentId: "IN1", paymentId: null, amountCents: 5000, state: "SUCCEEDED", createdAtFinix: new Date("2026-02-01") },
        { finixTransferId: "TR3", finixPaymentInstrumentId: "IN1", paymentId: null, amountCents: 2000, state: "FAILED", createdAtFinix: new Date("2026-02-15") },
      ]),
    },
    finixRefundOrReversal: { findMany: vi.fn().mockResolvedValue([{ finixOriginalTransferId: "TR1", amountCents: 3000 }]) },
    bankReturn: { findMany: vi.fn().mockResolvedValue([]) },
    finixDispute: { findMany: vi.fn().mockResolvedValue([{ finixTransferId: "TR2", amountCents: 500 }]) },
    finixSubscription: { findMany: vi.fn().mockResolvedValue([]) },
    payment: { findMany: vi.fn().mockResolvedValue([]) },
    ...overrides,
  };
}

describe("loadDonorAggregatesBatch", () => {
  beforeEach(() => vi.resetModules());

  it("counts only SUCCEEDED transfers as donations, excluding FAILED", async () => {
    const prismaMock = makePrismaMock();
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    const { loadDonorAggregatesBatch } = await import("@/lib/donors/donorAggregates");

    const result = await loadDonorAggregatesBatch(["D1"], "church-A");
    const agg = result.get("D1")!;

    expect(agg.donationCount).toBe(2); // TR1 + TR2, not TR3 (FAILED)
    expect(agg.totalDonatedCents).toBe(15000);
    expect(agg.failedPaymentCount).toBe(1);
  });

  it("computes netDonated as gross minus successful refunds minus bank returns", async () => {
    const prismaMock = makePrismaMock();
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    const { loadDonorAggregatesBatch } = await import("@/lib/donors/donorAggregates");

    const result = await loadDonorAggregatesBatch(["D1"], "church-A");
    const agg = result.get("D1")!;

    // gross 15000 - refund 3000 - returns 0 = 12000
    expect(agg.netDonatedCents).toBe(12000);
    expect(agg.refundedAmountCents).toBe(3000);
  });

  it("reports disputed amount as exposure, separate from and not subtracted from net", async () => {
    const prismaMock = makePrismaMock();
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    const { loadDonorAggregatesBatch } = await import("@/lib/donors/donorAggregates");

    const result = await loadDonorAggregatesBatch(["D1"], "church-A");
    const agg = result.get("D1")!;

    expect(agg.disputedAmountCents).toBe(500);
    // net still only reflects gross - refunds - returns, not the open dispute
    expect(agg.netDonatedCents).toBe(12000);
  });

  it("returns empty aggregates for a donor with no linked payment instrument", async () => {
    const prismaMock = makePrismaMock({
      finixPaymentInstrumentSnapshot: { findMany: vi.fn().mockResolvedValue([]) },
    });
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    const { loadDonorAggregatesBatch } = await import("@/lib/donors/donorAggregates");

    const result = await loadDonorAggregatesBatch(["D1"], "church-A");
    const agg = result.get("D1")!;

    expect(agg.donationCount).toBe(0);
    expect(agg.totalDonatedCents).toBe(0);
  });
});
