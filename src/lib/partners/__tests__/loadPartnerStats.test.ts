import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  partner: { findUnique: vi.fn() },
  church: { findMany: vi.fn() },
  partnerBillableApproval: { findMany: vi.fn() },
  onboardingApplication: { findMany: vi.fn() },
  partnerInvoice: { findMany: vi.fn() },
  finixRefundOrReversal: { aggregate: vi.fn() },
  bankReturn: { aggregate: vi.fn() },
  $queryRaw: vi.fn(),
}));
const flowMock = vi.hoisted(() => ({ loadMerchantMoneyFlow: vi.fn() }));
const residualMock = vi.hoisted(() => ({ loadResidualLedger: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/admin/merchantMoneyFlow", () => flowMock);
vi.mock("@/lib/admin/residuals", () => residualMock);

import { loadPartnerStats } from "../loadPartnerStats";

const churches = [
  { id: "c1", name: "Grace", partnerReference: "loc_1", status: "ACTIVE", finixMerchantId: "MU1", onboardingApplicationId: "a1" },
  { id: "c2", name: "Hope", partnerReference: null, status: "ACTIVE", finixMerchantId: "MU2", onboardingApplicationId: null },
  { id: "c3", name: "Quiet", partnerReference: "loc_3", status: "ACTIVE", finixMerchantId: null, onboardingApplicationId: null },
];
const flowRow = (churchId: string, over: Record<string, number>) => ({
  churchId, name: churchId, collectedCents: 0, paymentCount: 0, refundedCents: 0, feesCents: 0, donorCoveredFeesCents: 0, depositedCents: 0, pulledBackCents: 0, awaitingDepositCents: 0, ...over,
});
const from = new Date("2026-10-01T00:00:00Z");
const to = new Date("2026-11-01T00:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.partner.findUnique.mockResolvedValue({ id: "p1", name: "Clear Vision", pricePerMerchantCents: 1000 });
  prismaMock.church.findMany.mockResolvedValue(churches);
  prismaMock.partnerBillableApproval.findMany.mockResolvedValue([{ churchId: "c1", approvedAt: new Date("2026-01-05") }]);
  prismaMock.onboardingApplication.findMany.mockResolvedValue([{ id: "a1", onboardingStatus: "APPROVED" }]);
  prismaMock.partnerInvoice.findMany.mockResolvedValue([{ amountCents: 2000, status: "SUCCEEDED" }, { amountCents: 3000, status: "FAILED" }, { amountCents: 1000, status: "WAIVED" }]);
  prismaMock.finixRefundOrReversal.aggregate.mockResolvedValue({ _sum: { amountCents: 2500 } });
  prismaMock.bankReturn.aggregate.mockResolvedValue({ _sum: { amountCents: 500 } });
  // In call order: by method, merchants processing, WGC charged per merchant, WGC charged per month.
  prismaMock.$queryRaw
    .mockResolvedValueOnce([
      { method: "CARD", amount: BigInt(150000), count: BigInt(10) },
      { method: "ACH", amount: BigInt(20000), count: BigInt(3) },
    ])
    .mockResolvedValueOnce([{ count: BigInt(2) }])
    .mockResolvedValueOnce([{ church_id: "c1", charged: 700.4 }, { church_id: "c2", charged: 300 }])
    .mockResolvedValueOnce([{ month: new Date("2026-10-01T00:00:00Z"), charged: 1000.4 }]);
  flowMock.loadMerchantMoneyFlow.mockResolvedValue({
    rows: [
      flowRow("c1", { collectedCents: 120000, paymentCount: 9, refundedCents: 2000, feesCents: 3800, donorCoveredFeesCents: 800, depositedCents: 100000, awaitingDepositCents: 14200 }),
      flowRow("c2", { collectedCents: 50000, paymentCount: 4, refundedCents: 1000, feesCents: 1500, depositedCents: 40000, pulledBackCents: 50, awaitingDepositCents: 7500 }),
      flowRow("not-mine", { collectedCents: 999999, paymentCount: 99, feesCents: 99999 }),
    ],
  });
  residualMock.loadResidualLedger.mockResolvedValue({
    months: [{ month: "2026-10-01T00:00:00.000Z", wgcChargedCents: 4000, statement: { state: "APPROVED", costsCents: 2000, totalResidualCents: 1200 } }],
  });
});

describe("loadPartnerStats", () => {
  it("is null for an unknown partner and reads nothing else", async () => {
    prismaMock.partner.findUnique.mockResolvedValue(null);
    expect(await loadPartnerStats("nope", from, to)).toBeNull();
    expect(prismaMock.church.findMany).not.toHaveBeenCalled();
  });

  it("uses the main dashboard's rule for a successful charge, not a looser one", async () => {
    await loadPartnerStats("p1", from, to);
    const sql = (prismaMock.$queryRaw.mock.calls[0][0] as { sql: string }).sql;
    expect(sql).toContain("SETTLEMENT");
    expect(sql).toContain("RETURN");
    expect(sql).toContain("REVERSAL");
    expect(sql).toContain("SUCCEEDED");
  });

  it("only reads the partner's own organizations", async () => {
    await loadPartnerStats("p1", from, to);
    expect(prismaMock.church.findMany.mock.calls[0][0].where).toEqual({ partnerId: "p1" });
    expect(prismaMock.finixRefundOrReversal.aggregate.mock.calls[0][0].where.churchId).toEqual({ in: ["c1", "c2", "c3"] });
    expect(prismaMock.bankReturn.aggregate.mock.calls[0][0].where.churchId).toEqual({ in: ["c1", "c2", "c3"] });
    for (const call of prismaMock.$queryRaw.mock.calls) expect((call[0] as { values: unknown[] }).values.flat()).toEqual(expect.arrayContaining(["c1", "c2", "c3"]));
    expect(prismaMock.partnerInvoice.findMany.mock.calls[0][0].where.partnerId).toBe("p1");
  });

  it("totals processed by method, then net, average, refunds and ACH returns the way the dashboard does", async () => {
    const s = (await loadPartnerStats("p1", from, to))!;
    expect(s.processed).toEqual({ amountCents: 170000, count: 13 });
    expect(s.byMethod).toMatchObject({ CARD: { amountCents: 150000, count: 10 }, ACH: { amountCents: 20000, count: 3 }, OTHER: { amountCents: 0, count: 0 } });
    expect(s.refundsCents).toBe(2500);
    expect(s.achReturnsCents).toBe(500);
    expect(s.netProcessedCents).toBe(170000 - 2500 - 500);
    expect(s.averagePaymentCents).toBe(Math.round(170000 / 13));
    expect(s.merchants).toEqual({ linked: 3, processing: 2, active: 2 });
  });

  it("asks the money flow for this partner's organizations only, not the whole platform", async () => {
    await loadPartnerStats("p1", from, to);
    expect(flowMock.loadMerchantMoneyFlow.mock.calls[0][1]).toEqual({ churchIds: ["c1", "c2", "c3"] });
  });

  it("takes fees and deposits from the dashboard's own merchant rows, for this partner's organizations only", async () => {
    const s = (await loadPartnerStats("p1", from, to))!;
    expect(s.byMerchant.map((m) => m.name)).toEqual(["Grace", "Hope", "Quiet"]);
    expect(s.byMerchant[0]).toMatchObject({ processedCents: 120000, paymentCount: 9, refundedCents: 2000, finixFeesCents: 3800, wgcChargedCents: 700, depositedCents: 100000, awaitingDepositCents: 14200, onboardingStatus: "APPROVED" });
    expect(s.moneyFlow).toEqual({ finixFeesCents: 5300, donorCoveredFeesCents: 800, depositedCents: 140000, pulledBackCents: 50, awaitingDepositCents: 21700 });
    expect(JSON.stringify(s)).not.toContain("not-mine");
  });

  it("estimates the partner's share of Finix's statement from its share of the fees WGC charged", async () => {
    const s = (await loadPartnerStats("p1", from, to))!;
    expect(s.wgc.chargedCents).toBe(1000);
    expect(s.wgc.months).toHaveLength(1);
    expect(s.wgc.months[0]).toMatchObject({ partnerChargedCents: 1000, platformChargedCents: 4000, sharePercent: 25, estimatedFinixCostsCents: 500, estimatedResidualCents: 300 });
    expect(s.wgc.estimatedFinixCostsCents).toBe(500);
    expect(s.wgc.estimatedResidualCents).toBe(300);
    expect(s.wgc.partnerBillingInvoicedCents).toBe(5000);
    expect(s.wgc.partnerBillingCollectedCents).toBe(2000);
    expect(s.wgc.estimatedRevenueCents).toBe(300 + 2000);
  });

  it("leaves a month out of the estimate until Finix's statement is imported and approved", async () => {
    residualMock.loadResidualLedger.mockResolvedValue({ months: [{ month: "2026-10-01T00:00:00.000Z", wgcChargedCents: 4000, statement: { state: "PENDING", costsCents: 2000, totalResidualCents: 1200 } }] });
    const s = (await loadPartnerStats("p1", from, to))!;
    expect(s.wgc.months[0].estimatedResidualCents).toBeNull();
    expect(s.wgc.estimatedResidualCents).toBe(0);
    expect(s.wgc.monthsAwaitingStatement).toBe(1);
  });

  it("a partner with no organizations has zeros and runs no payment queries", async () => {
    prismaMock.church.findMany.mockResolvedValue([]);
    const s = (await loadPartnerStats("p1", from, to))!;
    expect(s.processed).toEqual({ amountCents: 0, count: 0 });
    expect(s.byMerchant).toEqual([]);
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    expect(flowMock.loadMerchantMoneyFlow).not.toHaveBeenCalled();
  });
});
