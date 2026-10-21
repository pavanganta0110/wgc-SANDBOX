import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  $queryRaw: vi.fn(),
  finixResidualPayout: { findMany: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

const { loadResidualLedger } = await import("../residuals");

const row = (month: string, charged: number, cost: number, payments = 10) => ({
  month: new Date(`${month}-01T00:00:00Z`),
  payments: BigInt(payments),
  charged,
  cost,
  missing: BigInt(0),
});
const payout = (month: string, amountCents: number) => ({
  id: `p-${month}`,
  periodMonth: new Date(`${month}-01T00:00:00Z`),
  amountCents,
  receivedAt: new Date("2026-09-01T00:00:00Z"),
  finixBillingSettlementId: null,
  note: null,
  recordedByEmail: "admin@wgc.test",
});

describe("loadResidualLedger", () => {
  beforeEach(() => vi.clearAllMocks());

  it("flags every past-due month as unpaid when Finix has never paid", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([row("2026-06", 10_000, 4_000), row("2026-07", 20_000, 8_000), row("2026-09", 5_000, 2_000), row("2026-10", 1_000, 400)]);
    mockPrisma.finixResidualPayout.findMany.mockResolvedValue([]);

    const ledger = await loadResidualLedger(new Date("2026-10-20T12:00:00Z"));

    expect(ledger.months.map((m) => [m.label, m.status])).toEqual([
      ["Jun 2026", "OVERDUE"],
      ["Jul 2026", "OVERDUE"],
      ["Aug 2026", "NOTHING_OWED"], // no payments that month: gap is filled, nothing owed
      ["Sep 2026", "NOT_DUE"], // expected by Nov 1
      ["Oct 2026", "IN_PROGRESS"],
    ]);
    expect(ledger.dueCents).toBe(6_000 + 12_000);
    expect(ledger.paidCents).toBe(0);
    expect(ledger.outstandingCents).toBe(18_000);
    expect(ledger.upcomingCents).toBe(3_000 + 600);
    expect(ledger.oldestOverdueMonth).toBe("2026-06-01T00:00:00.000Z");
    expect(ledger.daysOverdue).toBe(80); // expected by Aug 1, now Oct 20
  });

  it("marks months paid or partly paid from recorded payouts", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([row("2026-06", 10_000, 4_000), row("2026-07", 20_000, 8_000)]);
    mockPrisma.finixResidualPayout.findMany.mockResolvedValue([payout("2026-06", 6_000), payout("2026-07", 5_000)]);

    const ledger = await loadResidualLedger(new Date("2026-10-20T12:00:00Z"));
    const byLabel = Object.fromEntries(ledger.months.map((m) => [m.label, m]));

    expect(byLabel["Jun 2026"].status).toBe("PAID");
    expect(byLabel["Jul 2026"].status).toBe("PARTIAL");
    expect(ledger.outstandingCents).toBe(18_000 - 11_000);
    expect(ledger.oldestOverdueMonth).toBe("2026-07-01T00:00:00.000Z");
  });

  it("treats a month where Finix cost exceeds what WGC charged as nothing owed", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([row("2026-06", 1_000, 1_500)]);
    mockPrisma.finixResidualPayout.findMany.mockResolvedValue([]);

    const ledger = await loadResidualLedger(new Date("2026-10-20T12:00:00Z"));

    expect(ledger.months[0].status).toBe("NOTHING_OWED");
    expect(ledger.months[0].expectedCents).toBe(-500);
    expect(ledger.outstandingCents).toBe(0);
  });
});
