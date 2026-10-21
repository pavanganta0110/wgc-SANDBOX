import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  $queryRaw: vi.fn(),
  finixResidualSettlement: { findMany: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

const { loadResidualLedger } = await import("../residuals");

const charged = (month: string, cents: number, payments = 10) => ({ month: new Date(`${month}-01T00:00:00Z`), payments: BigInt(payments), charged: cents });
const statement = (month: string, fees: number, costs: number, residual: number, extra: Record<string, unknown> = {}) => {
  const start = new Date(`${month}-01T00:00:00Z`);
  return {
    id: `s-${month}`,
    finixBillingSettlementId: `billing_settlement_${month}`,
    windowStart: start,
    windowEnd: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)),
    merchantFeesCents: fees,
    costsCents: costs,
    totalResidualCents: residual,
    revSharePercent: 100,
    state: "APPROVED",
    depositReceivedAt: null,
    depositNote: null,
    updatedAt: new Date("2026-10-20T00:00:00Z"),
    ...extra,
  };
};

describe("loadResidualLedger", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses Finix's statements for WGC's real Jul–Sep 2026 numbers", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([charged("2026-08", 3100), charged("2026-09", 9053), charged("2026-10", 2114, 6)]);
    mockPrisma.finixResidualSettlement.findMany.mockResolvedValue([
      statement("2026-07", 154, 457.485, -303),
      statement("2026-08", 3560, 2833.603, 726, { depositReceivedAt: new Date("2026-09-16T00:00:00Z") }),
      statement("2026-09", 9795, 5669.617, 4125),
    ]);

    const ledger = await loadResidualLedger(new Date("2026-10-20T12:00:00Z"));

    expect(ledger.months.map((m) => [m.label, m.status])).toEqual([
      ["Jul 2026", "NEGATIVE"],
      ["Aug 2026", "RECEIVED"],
      ["Sep 2026", "PAID_UNCONFIRMED"],
      ["Oct 2026", "IN_PROGRESS"],
    ]);
    expect(ledger.totals).toEqual({ feesCents: 13509, costsCents: 8961, residualCents: 4548, receivedCents: 726, unconfirmedCents: 4125 });
    expect(ledger.months[2].feeDifferenceCents).toBe(9795 - 9053);
    expect(ledger.missingStatementMonths).toEqual([]);
  });

  it("flags a finished month with WGC payments but no Finix statement after the 20th", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([charged("2026-09", 9053)]);
    mockPrisma.finixResidualSettlement.findMany.mockResolvedValue([]);

    expect((await loadResidualLedger(new Date("2026-10-10T00:00:00Z"))).months[0].status).toBe("WAITING_ON_FINIX");
    const late = await loadResidualLedger(new Date("2026-10-21T00:00:00Z"));
    expect(late.months[0].status).toBe("STATEMENT_MISSING");
    expect(late.missingStatementMonths).toEqual(["2026-09-01T00:00:00.000Z"]);
  });

  it("shows a statement that isn't approved yet as pending", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    mockPrisma.finixResidualSettlement.findMany.mockResolvedValue([statement("2026-09", 9795, 5669.6, 4125, { state: "PENDING" })]);

    const ledger = await loadResidualLedger(new Date("2026-10-20T00:00:00Z"));
    expect(ledger.months[0].status).toBe("PENDING");
    expect(ledger.totals.residualCents).toBe(0);
  });
});
