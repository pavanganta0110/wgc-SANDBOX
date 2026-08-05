import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Cross-checks that donorSummary.ts's org-wide totalDonatedCents (computed
 * via direct SQL aggregates, for scalability at any organization size) and
 * donorAggregates.ts's per-donor loadDonorAggregatesBatch totals (used by
 * the donor list/profile/export) agree for the exact same underlying data —
 * these are two independently-written code paths over the same
 * FinixTransfer/ExternalDonation tables, and this test is the guardrail
 * against them silently drifting apart if one is edited without the other.
 */

function makePrismaMock() {
  const instruments = [
    { finixPaymentInstrumentId: "IN1", donorId: "D1" },
    { finixPaymentInstrumentId: "IN2", donorId: "D2" },
  ];
  const transfers = [
    { finixTransferId: "T1", finixPaymentInstrumentId: "IN1", paymentId: null, amountCents: 10000, state: "SUCCEEDED", createdAtFinix: new Date("2026-01-01") },
    { finixTransferId: "T2", finixPaymentInstrumentId: "IN2", paymentId: null, amountCents: 20000, state: "SUCCEEDED", createdAtFinix: new Date("2026-01-02") },
  ];
  const externalDonations = [
    { donorId: "D1", donationAmountCents: 5000, donationDate: new Date("2026-01-03"), depositStatus: null },
    { donorId: "D2", donationAmountCents: 3000, donationDate: new Date("2026-01-04"), depositStatus: null },
  ];

  return {
    finixPaymentInstrumentSnapshot: { findMany: vi.fn().mockResolvedValue(instruments) },
    finixTransfer: {
      findMany: vi.fn().mockResolvedValue(transfers),
      aggregate: vi.fn().mockResolvedValue({ _sum: { amountCents: 30000 }, _count: 2 }),
    },
    finixRefundOrReversal: { findMany: vi.fn().mockResolvedValue([]) },
    bankReturn: { findMany: vi.fn().mockResolvedValue([]) },
    finixDispute: { findMany: vi.fn().mockResolvedValue([]) },
    finixSubscription: { findMany: vi.fn().mockResolvedValue([]) },
    payment: { findMany: vi.fn().mockResolvedValue([]) },
    invoice: { findMany: vi.fn().mockResolvedValue([]) },
    invoicePayment: { findMany: vi.fn().mockResolvedValue([]) },
    externalDonation: {
      findMany: vi.fn().mockResolvedValue(externalDonations),
      aggregate: vi.fn().mockResolvedValue({ _sum: { donationAmountCents: 8000 }, _count: 2 }),
    },
    donor: {
      findMany: vi.fn().mockResolvedValue([
        { id: "D1", createdAt: new Date("2025-01-01") },
        { id: "D2", createdAt: new Date("2025-01-01") },
      ]),
      count: vi.fn().mockResolvedValue(2),
    },
    donorNote: { count: vi.fn().mockResolvedValue(0) },
  };
}

async function loadModules(prismaMock: ReturnType<typeof makePrismaMock>) {
  vi.resetModules();
  vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
  const donorAggregates = await import("@/lib/donors/donorAggregates");
  const donorSummary = await import("@/lib/donors/donorSummary");
  return { donorAggregates, donorSummary };
}

beforeEach(() => vi.clearAllMocks());

describe("Donation total reconciliation — org summary vs. sum of per-donor aggregates", () => {
  it("loadDonorSummary's totalDonatedCents equals the sum of loadDonorAggregatesBatch totals for the same donors", async () => {
    const prismaMock = makePrismaMock();
    const { donorAggregates, donorSummary } = await loadModules(prismaMock);

    const summary = await donorSummary.loadDonorSummary("church-a");
    const perDonor = await donorAggregates.loadDonorAggregatesBatch(["D1", "D2"], "church-a");

    const sumOfPerDonorTotals = [...perDonor.values()].reduce((s, a) => s + a.totalDonatedCents, 0);

    expect(summary.totalDonatedCents).toBe(sumOfPerDonorTotals);
    expect(summary.totalDonatedCents).toBe(38000);
  });

  it("loadDonorSummary's externalDonatedCents equals the sum of loadDonorAggregatesBatch externalDonatedCents", async () => {
    const prismaMock = makePrismaMock();
    const { donorAggregates, donorSummary } = await loadModules(prismaMock);

    const summary = await donorSummary.loadDonorSummary("church-a");
    const perDonor = await donorAggregates.loadDonorAggregatesBatch(["D1", "D2"], "church-a");

    const sumOfExternal = [...perDonor.values()].reduce((s, a) => s + a.externalDonatedCents, 0);

    expect(summary.externalDonatedCents).toBe(sumOfExternal);
    expect(summary.externalDonatedCents).toBe(8000);
  });

  it("wgcProcessedCents (summary) equals totalDonatedCents minus externalDonatedCents, matching the per-donor split shown on the donor list", async () => {
    const prismaMock = makePrismaMock();
    const { donorSummary } = await loadModules(prismaMock);

    const summary = await donorSummary.loadDonorSummary("church-a");

    expect(summary.wgcProcessedCents).toBe(summary.totalDonatedCents - summary.externalDonatedCents);
    expect(summary.wgcProcessedCents).toBe(30000);
  });
});
