import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Proves loadTopDonors/loadDonorSummary already aggregate strictly by
 * canonical Donor.id — the analytics math was never the bug (duplicate
 * donor *rows* were). A donor who has two Finix payment instruments
 * (e.g. two different cards, or a card + a wallet identity — exactly
 * the shape that used to create two separate Donor rows before the
 * resolveOrCreateDonor fix) linked to the SAME donorId must appear once,
 * with every payment/subscription combined.
 */

function makePrismaMock(overrides: Record<string, any> = {}) {
  return {
    finixPaymentInstrumentSnapshot: {
      findMany: vi.fn().mockResolvedValue([
        { finixPaymentInstrumentId: "IN1", donorId: "D1" },
        { finixPaymentInstrumentId: "IN2", donorId: "D1" },
        { finixPaymentInstrumentId: "IN3", donorId: "D2" },
      ]),
    },
    finixTransfer: {
      findMany: vi.fn().mockResolvedValue([
        { finixTransferId: "TR1", finixPaymentInstrumentId: "IN1", amountCents: 5000, state: "SUCCEEDED", createdAtFinix: new Date("2026-01-01") },
        { finixTransferId: "TR2", finixPaymentInstrumentId: "IN2", amountCents: 7500, state: "SUCCEEDED", createdAtFinix: new Date("2026-02-01") },
        { finixTransferId: "TR3", finixPaymentInstrumentId: "IN3", amountCents: 1000, state: "SUCCEEDED", createdAtFinix: new Date("2026-01-15") },
      ]),
      aggregate: vi.fn().mockResolvedValue({ _sum: { amountCents: 13500 }, _count: 3 }),
    },
    finixRefundOrReversal: { findMany: vi.fn().mockResolvedValue([]) },
    bankReturn: { findMany: vi.fn().mockResolvedValue([]) },
    finixSubscription: {
      findMany: vi.fn().mockResolvedValue([
        { finixPaymentInstrumentId: "IN1", amountCents: 2000, billingInterval: "MONTHLY" },
        { finixPaymentInstrumentId: "IN2", amountCents: 3000, billingInterval: "MONTHLY" },
      ]),
    },
    donor: {
      findMany: vi.fn().mockResolvedValue([
        { id: "D1", name: "Pavan Reddy", anonymousPreference: false },
        { id: "D2", name: "Someone Else", anonymousPreference: false },
      ]),
      count: vi.fn().mockResolvedValue(2),
    },
    ...overrides,
  };
}

async function loadModule(prismaMock: ReturnType<typeof makePrismaMock>) {
  vi.resetModules();
  vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
  return import("@/lib/donors/donorAnalytics");
}

beforeEach(() => vi.clearAllMocks());

describe("loadTopDonors — one canonical donor combines every linked instrument's payments", () => {
  it("a donor with two payment instruments appears once, with donation count and gross summed across both", async () => {
    const prismaMock = makePrismaMock();
    const { loadTopDonors } = await loadModule(prismaMock);

    const { rows } = await loadTopDonors("church-a", undefined, "gross", 10);

    const d1Rows = rows.filter((r) => r.donorId === "D1");
    expect(d1Rows).toHaveLength(1);
    // Donation Count reflects the number of qualifying transfers (2), not
    // the number of donor rows or instruments (which would both be wrong
    // counts here) — this is the exact distinction the spec calls out.
    expect(d1Rows[0].donationCount).toBe(2);
    expect(d1Rows[0].metricValueCents).toBe(12500); // 5000 + 7500, combined gross
  });

  it("Recurring Value combines active subscriptions across every instrument for one donor into a single row", async () => {
    const prismaMock = makePrismaMock();
    const { loadTopDonors } = await loadModule(prismaMock);

    prismaMock.finixSubscription.findMany.mockResolvedValue([
      { finixPaymentInstrumentId: "IN1", amountCents: 2000, billingInterval: "MONTHLY" },
      { finixPaymentInstrumentId: "IN2", amountCents: 3000, billingInterval: "MONTHLY" },
    ]);
    prismaMock.donor.findMany.mockResolvedValue([{ id: "D1", name: "Pavan Reddy", anonymousPreference: false }]);

    const { rows } = await loadTopDonors("church-a", undefined, "recurring", 10);

    expect(rows).toHaveLength(1);
    expect(rows[0].donorId).toBe("D1");
    expect(rows[0].metricValueCents).toBe(5000); // 2000 + 3000 monthly, one donor
  });
});

describe("loadDonorSummary — Total Donors counts canonical donor profiles", () => {
  it("counts distinct Donor rows, not payments or instruments", async () => {
    vi.resetModules();
    const prismaMock = makePrismaMock();
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    vi.doMock("@/lib/donors/donorAggregates", () => ({
      loadDonorAggregatesBatch: vi.fn().mockResolvedValue(
        new Map([
          ["D1", { totalDonatedCents: 12500, donationCount: 2, firstDonationAt: new Date("2026-01-01"), lastDonationAt: new Date("2026-02-01"), activeSubscriptionCount: 2, failedPaymentCount: 0 }],
          ["D2", { totalDonatedCents: 1000, donationCount: 1, firstDonationAt: new Date("2026-01-15"), lastDonationAt: new Date("2026-01-15"), activeSubscriptionCount: 0, failedPaymentCount: 0 }],
        ])
      ),
    }));
    vi.doMock("@/lib/donors/donorRiskSignals", () => ({
      loadDonorRiskSignals: vi.fn().mockResolvedValue(new Map([
        ["D1", { hasActiveSubscription: true }],
        ["D2", { hasActiveSubscription: false }],
      ])),
    }));
    vi.doMock("@/lib/donors/donorStatus", () => ({
      resolveDonorDisplayStatus: () => "ACTIVE",
      resolveDonorNeedsAttentionReasons: () => [],
    }));
    prismaMock.donor.findMany.mockResolvedValue([
      { id: "D1", createdAt: new Date("2026-01-01") },
      { id: "D2", createdAt: new Date("2026-01-15") },
    ]);

    const { loadDonorSummary } = await import("@/lib/donors/donorSummary");
    const summary = await loadDonorSummary("church-a");

    // D1 has two payments and two subscriptions but is one Donor row —
    // Total Donors must reflect that, not the payment/subscription count.
    expect(summary.totalDonors).toBe(2);
    expect(prismaMock.donor.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ churchId: "church-a", archivedAt: null }) })
    );
  });

  it("Recurring Donors counts one donor even when they have multiple active subscriptions", async () => {
    vi.resetModules();
    const prismaMock = makePrismaMock();
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    vi.doMock("@/lib/donors/donorAggregates", () => ({
      loadDonorAggregatesBatch: vi.fn().mockResolvedValue(
        new Map([["D1", { totalDonatedCents: 0, donationCount: 0, firstDonationAt: null, lastDonationAt: null, activeSubscriptionCount: 2, failedPaymentCount: 0 }]])
      ),
    }));
    vi.doMock("@/lib/donors/donorRiskSignals", () => ({
      loadDonorRiskSignals: vi.fn().mockResolvedValue(new Map([["D1", { hasActiveSubscription: true }]])),
    }));
    vi.doMock("@/lib/donors/donorStatus", () => ({
      resolveDonorDisplayStatus: () => "ACTIVE",
      resolveDonorNeedsAttentionReasons: () => [],
    }));
    prismaMock.donor.count.mockResolvedValue(1);
    prismaMock.donor.findMany.mockResolvedValue([{ id: "D1", createdAt: new Date("2026-01-01") }]);

    const { loadDonorSummary } = await import("@/lib/donors/donorSummary");
    const summary = await loadDonorSummary("church-a");

    expect(summary.recurringDonors).toBe(1);
  });
});
