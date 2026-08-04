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
    invoice: { findMany: vi.fn().mockResolvedValue([]) },
    invoicePayment: { findMany: vi.fn().mockResolvedValue([]) },
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

describe("loadDonorAggregatesBatch — invoice payment contributions", () => {
  beforeEach(() => vi.resetModules());

  it("folds a linked CHARITABLE_DONATION invoice payment into Total Donated alongside Finix donations", async () => {
    const prismaMock = makePrismaMock({
      invoice: { findMany: vi.fn().mockResolvedValue([{ id: "inv1", linkedDonorId: "D1", classification: "CHARITABLE_DONATION", totalCents: 20000, charitablePortionCents: null }]) },
      invoicePayment: {
        findMany: vi.fn().mockResolvedValue([
          { invoiceId: "inv1", grossAmountCents: 20000, refundedCents: 0, feeContributionCents: 0, feeContributionRefundedCents: 0, customerCoveredFee: false, createdAt: new Date("2026-03-01") },
        ]),
      },
    });
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    const { loadDonorAggregatesBatch } = await import("@/lib/donors/donorAggregates");

    const result = await loadDonorAggregatesBatch(["D1"], "church-A");
    const agg = result.get("D1")!;

    expect(agg.donationCount).toBe(3); // 2 Finix (TR1 succeeded, TR2 succeeded) + 1 invoice payment
    expect(agg.totalDonatedCents).toBe(35000); // 10000 + 5000 (Finix) + 20000 (invoice)
  });

  it("works for a donor with no Finix instrument at all — invoice-only giving history", async () => {
    const prismaMock = makePrismaMock({
      finixPaymentInstrumentSnapshot: { findMany: vi.fn().mockResolvedValue([]) },
      invoice: { findMany: vi.fn().mockResolvedValue([{ id: "inv1", linkedDonorId: "D1", classification: "CHARITABLE_DONATION", totalCents: 5000, charitablePortionCents: null }]) },
      invoicePayment: {
        findMany: vi.fn().mockResolvedValue([
          { invoiceId: "inv1", grossAmountCents: 5000, refundedCents: 0, feeContributionCents: 0, feeContributionRefundedCents: 0, customerCoveredFee: false, createdAt: new Date("2026-03-01") },
        ]),
      },
    });
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    const { loadDonorAggregatesBatch } = await import("@/lib/donors/donorAggregates");

    const result = await loadDonorAggregatesBatch(["D1"], "church-A");
    const agg = result.get("D1")!;

    expect(agg.donationCount).toBe(1);
    expect(agg.totalDonatedCents).toBe(5000);
  });

  it("never attributes an invoice payment to a specific fundraiser (no attribution column exists) — omitted entirely from a scoped view", async () => {
    const invoiceFindMany = vi.fn().mockResolvedValue([{ id: "inv1", linkedDonorId: "D1", classification: "CHARITABLE_DONATION", totalCents: 20000, charitablePortionCents: null }]);
    const prismaMock = makePrismaMock({ invoice: { findMany: invoiceFindMany } });
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    const { loadDonorAggregatesBatch } = await import("@/lib/donors/donorAggregates");

    await loadDonorAggregatesBatch(["D1"], "church-A", undefined, "fundraiser-user-1");
    expect(invoiceFindMany).not.toHaveBeenCalled();
  });
});
