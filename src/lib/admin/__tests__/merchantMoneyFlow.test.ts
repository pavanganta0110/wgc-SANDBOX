import { describe, it, expect, vi } from "vitest";

// $queryRaw call order inside loadMerchantMoneyFlow: charges, fees, deposits, fee-payer coverage, payout fees.
const rawResults: unknown[][] = [
  [
    { church_id: "a", amount: BigInt(498774), count: BigInt(33) },
    { church_id: "b", amount: BigInt(1000), count: BigInt(1) },
  ],
  [
    { church_id: "a", fees: 15385.6, donor_covered: 13897.4 },
    { church_id: "b", fees: 50, donor_covered: null },
  ],
  [
    // "a": 23 payouts pushed to the bank, plus small fee settlements pulled back from it.
    { church_id: "a", amount: BigInt(481250), count: BigInt(23), pulled: BigInt(450) },
    { church_id: "b", amount: BigInt(1050), count: BigInt(2), pulled: null },
  ],
  [
    // "a": 32 of 33 donors covered the fee, 1 org absorbed it. "b": its charge has no payment record.
    { church_id: "a", covered: BigInt(32), org_paid: BigInt(1) },
    { church_id: "ghost", covered: BigInt(5), org_paid: BigInt(0) }, // no charges in period → ignored
  ],
  [
    // Finix's fixed per-payout fee: 23 payouts × 50¢ for "a".
    { church_id: "a", total: 1150, count: BigInt(23) },
  ],
];
let rawCall = 0;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(async () => rawResults[rawCall++]),
    finixRefundOrReversal: { groupBy: vi.fn().mockResolvedValue([{ churchId: "b", _sum: { amountCents: 0 } }]) },
    bankReturn: { groupBy: vi.fn().mockResolvedValue([]) },
    church: { findMany: vi.fn().mockResolvedValue([{ id: "a", name: "Alpha" }, { id: "b", name: "Beta" }]) },
  },
}));

describe("loadMerchantMoneyFlow", () => {
  it("lines up collected, fees, refunds and deposits per merchant and totals them", async () => {
    const { loadMerchantMoneyFlow } = await import("@/lib/admin/merchantMoneyFlow");
    const { resolveAdminPeriod } = await import("@/lib/admin/platformMetrics");
    const flow = await loadMerchantMoneyFlow(resolveAdminPeriod("ytd", new Date("2026-10-23T12:00:00Z")));

    const a = flow.rows.find((r) => r.churchId === "a")!;
    expect(a).toMatchObject({
      name: "Alpha",
      collectedCents: 498774,
      paymentCount: 33,
      feesCents: 15386, // rounded once per merchant, not per fee row
      donorCoveredFeesCents: 13897,
      refundedCents: 0,
      depositedCents: 481250,
      depositCount: 23,
      pulledBackCents: 450,
      donorCoveredCount: 32,
      orgPaidCount: 1,
      noFeeRecordCount: 0,
      payoutFeeCents: 1150, // 23 payouts × 50¢, already inside feesCents
      payoutFeeCount: 23,
    });
    // Money pulled back from the bank for fees is NOT a deposit: the bank received
    // 481250 − 450 = 480800, so 498774 − 15386 − 480800 = 2588 is still accruing.
    expect(a.awaitingDepositCents).toBe(2588);

    // Beta was deposited more than expected (1000 − 50 = 950 vs 1050): shown negative, not hidden.
    const b = flow.rows.find((r) => r.churchId === "b")!;
    expect(b.awaitingDepositCents).toBe(-100);
    // A charge with no WGC payment record is reported as unknown, never guessed as donor- or org-paid.
    expect(b).toMatchObject({ donorCoveredCount: 0, orgPaidCount: 0, noFeeRecordCount: 1 });
    expect(flow.totals).toMatchObject({ donorCoveredCount: 32, orgPaidCount: 1, noFeeRecordCount: 1 });

    expect(flow.rows.map((r) => r.churchId)).toEqual(["a", "b"]); // biggest collector first
    expect(flow.totals.collectedCents).toBe(499774);
    expect(flow.totals.depositedCents).toBe(482300);
    expect(flow.totals.pulledBackCents).toBe(450);
    expect(flow.totals.awaitingDepositCents).toBe(a.awaitingDepositCents + b.awaitingDepositCents);
  });
});
