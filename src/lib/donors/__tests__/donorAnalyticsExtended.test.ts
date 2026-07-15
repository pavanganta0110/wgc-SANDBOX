import { describe, it, expect, vi, beforeEach } from "vitest";

function makePrismaMock(overrides: Record<string, any> = {}) {
  return {
    donor: { findMany: vi.fn().mockResolvedValue([{ id: "D1", name: "Donor One", anonymousPreference: false }]) },
    finixPaymentInstrumentSnapshot: { findMany: vi.fn().mockResolvedValue([{ finixPaymentInstrumentId: "IN1", donorId: "D1" }]) },
    finixTransfer: { findMany: vi.fn().mockResolvedValue([]) },
    finixRefundOrReversal: { findMany: vi.fn().mockResolvedValue([]) },
    bankReturn: { findMany: vi.fn().mockResolvedValue([]) },
    finixDispute: { findMany: vi.fn().mockResolvedValue([]) },
    finixSubscription: { findMany: vi.fn().mockResolvedValue([]) },
    payment: { findMany: vi.fn().mockResolvedValue([]) },
    ...overrides,
  };
}

describe("loadDonorAnalyticsExtended — One-Time vs Recurring exact attribution", () => {
  beforeEach(() => vi.resetModules());

  it("classifies a transfer as recurring using Finix's own createdVia when present, ignoring the instrument-subscription approximation", async () => {
    const prismaMock = makePrismaMock({
      finixTransfer: {
        // Called twice: once by loadDonorAggregatesBatch (no createdVia select), once by the extended analytics (with createdVia).
        findMany: vi.fn().mockResolvedValue([
          { finixPaymentInstrumentId: "IN1", amountCents: 5000, createdVia: "SUBSCRIPTION", state: "SUCCEEDED", createdAtFinix: new Date("2026-01-01") },
          { finixPaymentInstrumentId: "IN1", amountCents: 3000, createdVia: "PAYMENT_LINK", state: "SUCCEEDED", createdAtFinix: new Date("2026-01-02") },
        ]),
      },
      // No FinixSubscription attached at all — proves the classification
      // isn't falling back to the approximation when createdVia is present.
      finixSubscription: { findMany: vi.fn().mockResolvedValue([]) },
    });
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    const { loadDonorAnalyticsExtended } = await import("@/lib/donors/donorAnalyticsExtended");

    const result = await loadDonorAnalyticsExtended("church-A", undefined, undefined);

    expect(result.oneTimeVsRecurring.recurringAmountCents).toBe(5000);
    expect(result.oneTimeVsRecurring.recurringCount).toBe(1);
    expect(result.oneTimeVsRecurring.oneTimeAmountCents).toBe(3000);
    expect(result.oneTimeVsRecurring.oneTimeCount).toBe(1);
  });

  it("falls back to the instrument-has-subscription approximation only when createdVia is missing", async () => {
    const prismaMock = makePrismaMock({
      finixTransfer: {
        findMany: vi.fn().mockResolvedValue([
          { finixPaymentInstrumentId: "IN1", amountCents: 4000, createdVia: null, state: "SUCCEEDED", createdAtFinix: new Date("2026-01-01") },
        ]),
      },
      finixSubscription: { findMany: vi.fn().mockResolvedValue([{ finixPaymentInstrumentId: "IN1" }]) },
    });
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    const { loadDonorAnalyticsExtended } = await import("@/lib/donors/donorAnalyticsExtended");

    const result = await loadDonorAnalyticsExtended("church-A", undefined, undefined);
    expect(result.oneTimeVsRecurring.recurringAmountCents).toBe(4000);
  });
});

describe("loadDonorGrowth", () => {
  beforeEach(() => vi.resetModules());

  it("classifies a donor as new only in the bucket containing their true first-ever donation, and returning afterward", async () => {
    const now = new Date("2026-02-15T12:00:00Z");
    const prismaMock = makePrismaMock({
      finixPaymentInstrumentSnapshot: {
        findMany: vi.fn().mockResolvedValue([{ finixPaymentInstrumentId: "IN1", donorId: "D1" }]),
      },
      finixTransfer: {
        findMany: vi.fn().mockResolvedValue([
          { finixPaymentInstrumentId: "IN1", createdAtFinix: new Date("2026-01-05T12:00:00Z") },
          { finixPaymentInstrumentId: "IN1", createdAtFinix: new Date("2026-02-10T12:00:00Z") },
        ]),
      },
    });
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    const { loadDonorGrowth } = await import("@/lib/donors/donorAnalyticsExtended");

    const points = await loadDonorGrowth("church-A", { gte: new Date("2026-01-01T00:00:00Z"), lte: now }, "weekly");

    const totalNew = points.reduce((s, p) => s + p.newDonors, 0);
    const totalReturning = points.reduce((s, p) => s + p.returningDonors, 0);
    expect(totalNew).toBe(1);
    expect(totalReturning).toBe(1);
  });

  it("returns an empty array when the organization has no donor-linked instruments", async () => {
    const prismaMock = makePrismaMock({
      finixPaymentInstrumentSnapshot: { findMany: vi.fn().mockResolvedValue([]) },
    });
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    const { loadDonorGrowth } = await import("@/lib/donors/donorAnalyticsExtended");

    const points = await loadDonorGrowth("church-A", undefined, "weekly");
    expect(points).toEqual([]);
  });

  it("counts a donor only once per bucket even with multiple donations in the same bucket", async () => {
    const prismaMock = makePrismaMock({
      finixPaymentInstrumentSnapshot: {
        findMany: vi.fn().mockResolvedValue([{ finixPaymentInstrumentId: "IN1", donorId: "D1" }]),
      },
      finixTransfer: {
        findMany: vi.fn().mockResolvedValue([
          { finixPaymentInstrumentId: "IN1", createdAtFinix: new Date("2026-02-10T10:00:00Z") },
          { finixPaymentInstrumentId: "IN1", createdAtFinix: new Date("2026-02-10T14:00:00Z") },
        ]),
      },
    });
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    const { loadDonorGrowth } = await import("@/lib/donors/donorAnalyticsExtended");

    const points = await loadDonorGrowth(
      "church-A",
      { gte: new Date("2026-02-01T00:00:00Z"), lte: new Date("2026-02-15T00:00:00Z") },
      "weekly",
    );
    const totalActive = points.reduce((s, p) => s + p.totalActiveDonors, 0);
    expect(totalActive).toBe(1);
  });
});
