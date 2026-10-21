import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  $queryRaw: vi.fn(),
  finixResidualSettlement: { findMany: vi.fn() },
  finixBillingTransfer: { findMany: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

const { loadResidualLedger, matchTransfersToStatements } = await import("../residuals");

const transfer = (id: string, createdAt: string, cents: number, depositType = "CREDIT", state = "SUCCEEDED") => ({
  id,
  finixBillingTransferId: `billing_transfer_${id}`,
  createdAtFinix: new Date(createdAt),
  amountCents: cents,
  depositType,
  state,
});

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
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.finixBillingTransfer.findMany.mockResolvedValue([]);
  });

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
      ["Sep 2026", "AWAITING_PAYOUT"],
      ["Oct 2026", "IN_PROGRESS"],
    ]);
    expect(ledger.totals).toEqual({ feesCents: 13509, costsCents: 8961, residualCents: 4548, paidByFinixCents: 0, receivedCents: 726, unconfirmedCents: 4125 });
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

  it("uses imported billing transfers: Aug paid Sep 15, Sep paid Oct 15, Jul never collected", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    mockPrisma.finixResidualSettlement.findMany.mockResolvedValue([
      statement("2026-07", 154, 457.485, -303),
      statement("2026-08", 3560, 2833.603, 726),
      statement("2026-09", 9795, 5669.617, 4125),
    ]);
    mockPrisma.finixBillingTransfer.findMany.mockResolvedValue([
      transfer("aug", "2026-09-15T01:24:37.72Z", 726),
      transfer("sep", "2026-10-15T20:23:00Z", 4125),
    ]);

    const ledger = await loadResidualLedger(new Date("2026-10-20T12:00:00Z"));
    const byLabel = Object.fromEntries(ledger.months.map((m) => [m.label, m]));

    expect(byLabel["Jul 2026"].status).toBe("NEGATIVE");
    expect(byLabel["Aug 2026"].status).toBe("PAID");
    expect(byLabel["Aug 2026"].payout?.createdAt).toBe("2026-09-15T01:24:37.720Z");
    expect(byLabel["Sep 2026"].status).toBe("PAID");
    expect(ledger.totals.paidByFinixCents).toBe(4851);
    expect(ledger.unmatchedTransfers).toEqual([]);
    expect(ledger.payoutMissingMonths).toEqual([]);
  });

  it("flags an approved month with no payout 45+ days after it closed, once transfers are imported", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    mockPrisma.finixResidualSettlement.findMany.mockResolvedValue([statement("2026-08", 3560, 2833.6, 726)]);
    mockPrisma.finixBillingTransfer.findMany.mockResolvedValue([transfer("other", "2026-09-20T00:00:00Z", 999)]);

    const ledger = await loadResidualLedger(new Date("2026-10-20T12:00:00Z"));
    expect(ledger.months[0].status).toBe("PAYOUT_MISSING");
    expect(ledger.unmatchedTransfers.map((t) => t.amountCents)).toEqual([999]);
  });

  it("marks a negative month collected when Finix debits it", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    mockPrisma.finixResidualSettlement.findMany.mockResolvedValue([statement("2026-07", 154, 457.485, -303)]);
    mockPrisma.finixBillingTransfer.findMany.mockResolvedValue([transfer("jul", "2026-08-15T00:00:00Z", 303, "DEBIT")]);

    expect((await loadResidualLedger(new Date("2026-10-20T12:00:00Z"))).months[0].status).toBe("COLLECTED");
  });
});

describe("matchTransfersToStatements", () => {
  const st = (id: string, end: string, residual: number) => ({ id, windowEnd: new Date(end), totalResidualCents: residual });

  it("never matches a payout created before the month closed, or the same statement twice", () => {
    const statements = [st("a", "2026-09-01T00:00:00Z", 500), st("b", "2026-10-01T00:00:00Z", 500)];
    const { byStatement, unmatched } = matchTransfersToStatements(
      [transfer("early", "2026-08-20T00:00:00Z", 500), transfer("1", "2026-09-15T00:00:00Z", 500), transfer("2", "2026-10-15T00:00:00Z", 500)],
      statements,
    );
    expect(byStatement.get("a")?.id).toBe("1");
    expect(byStatement.get("b")?.id).toBe("2");
    expect(unmatched.map((t) => t.id)).toEqual(["early"]);
  });
});
