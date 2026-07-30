import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    finixSettlement: { findUnique: vi.fn() },
    finixTransfer: { findMany: vi.fn() },
    payment: { findMany: vi.fn() },
    aplosAccountConfiguration: { findUnique: vi.fn() },
    aplosPurposeMapping: { findMany: vi.fn() },
    aplosSyncRecord: { findFirst: vi.fn() },
    donor: { findMany: vi.fn() },
  },
}));

const BASE_SETTLEMENT = {
  id: "settlement-row-1",
  finixSettlementId: "stl_1",
  churchId: "church-1",
  state: "SETTLED",
  totalAmountCents: 10000,
  netAmountCents: 9700,
  feeAmountCents: 300,
  refundAmountCents: 0,
  returnAmountCents: 0,
  disputeAmountCents: 0,
  otherAdjustmentAmountCents: 0,
};

const BASE_TRANSFER = {
  finixTransferId: "tr_1",
  paymentId: "pay-1",
  churchId: "church-1",
  finixSettlementId: "stl_1",
  state: "SUCCEEDED",
  amountCents: 10000,
  applicationFeeCents: 100,
};

const BASE_PAYMENT = {
  id: "pay-1",
  churchId: "church-1",
  donorId: "donor-1",
  fundId: "fund-1",
  isAnonymous: false,
  donationAmountCents: 10000,
  feeCoveredCents: 0,
  amountCents: 10000,
  actualFinixFeesCents: 320,
  goodsServicesProvided: false,
  goodsServicesFairMarketValueCents: null,
  createdAt: new Date("2026-01-15T12:00:00.000Z"),
};

const BASE_ACCOUNT_CONFIG = { churchId: "church-1", depositAccountId: "1000", processingFeeExpenseAccountId: "6000", defaultPurposeId: "55" };

const BASE_DONOR = { id: "donor-1", name: "Jane Smith", email: "jane@example.com" };

async function setup(overrides: {
  settlement?: Partial<typeof BASE_SETTLEMENT> | null;
  transfers?: Partial<typeof BASE_TRANSFER>[];
  payments?: Partial<typeof BASE_PAYMENT>[];
  accountConfig?: Partial<typeof BASE_ACCOUNT_CONFIG> | null;
  mappings?: unknown[];
  alreadySynced?: unknown;
  donors?: Partial<typeof BASE_DONOR>[];
} = {}) {
  const { prisma } = await import("@/lib/prisma");
  vi.mocked(prisma.finixSettlement.findUnique).mockResolvedValue(
    overrides.settlement === null ? null : ({ ...BASE_SETTLEMENT, ...overrides.settlement } as never)
  );
  const transfers = (overrides.transfers ?? [BASE_TRANSFER]).map((t) => ({ ...BASE_TRANSFER, ...t }));
  vi.mocked(prisma.finixTransfer.findMany).mockResolvedValue(transfers as never);
  const payments = (overrides.payments ?? [BASE_PAYMENT]).map((p) => ({ ...BASE_PAYMENT, ...p }));
  vi.mocked(prisma.payment.findMany).mockResolvedValue(payments as never);
  vi.mocked(prisma.aplosAccountConfiguration.findUnique).mockResolvedValue(
    overrides.accountConfig === null ? null : ({ ...BASE_ACCOUNT_CONFIG, ...overrides.accountConfig } as never)
  );
  vi.mocked(prisma.aplosPurposeMapping.findMany).mockResolvedValue((overrides.mappings ?? [{ wgcFundId: "fund-1", aplosPurposeId: "42" }]) as never);
  vi.mocked(prisma.aplosSyncRecord.findFirst).mockResolvedValue((overrides.alreadySynced ?? null) as never);
  vi.mocked(prisma.donor.findMany).mockResolvedValue((overrides.donors ?? [BASE_DONOR]) as never);
  const { buildSettlementContributions } = await import("../contributionBuilder");
  return buildSettlementContributions("stl_1", "church-1");
}

describe("buildSettlementContributions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("builds a single contribution for a single card payment with no donor-covered fee", async () => {
    const result = await setup();
    expect(result.eligible).toBe(true);
    expect(result.contributions).toHaveLength(1);
    const [c] = result.contributions;
    expect(c.payload.date).toBe("2026-01-15");
    expect(c.payload.lines).toHaveLength(1);
    expect(c.payload.lines[0].amount).toBe(100);
    expect(c.payload.lines[0].purpose.id).toBe(42);
  });

  it("builds correctly for an ACH-style payment (same fields, different rail — no ACH-specific branching)", async () => {
    const result = await setup({ payments: [{ ...BASE_PAYMENT }] });
    expect(result.eligible).toBe(true);
    expect(result.contributions[0].payload.lines[0].amount).toBe(100);
  });

  it("groups multiple donations across different funds and different dates into separate contributions", async () => {
    const result = await setup({
      settlement: { totalAmountCents: 15000 },
      transfers: [
        { finixTransferId: "tr_1", paymentId: "pay-1" },
        { finixTransferId: "tr_2", paymentId: "pay-2", amountCents: 5000 },
      ],
      payments: [
        { id: "pay-1", createdAt: new Date("2026-01-15T12:00:00.000Z"), fundId: "fund-1" },
        { id: "pay-2", createdAt: new Date("2026-01-16T12:00:00.000Z"), fundId: "fund-2", donationAmountCents: 5000, amountCents: 5000, actualFinixFeesCents: 200 },
      ],
      mappings: [
        { wgcFundId: "fund-1", aplosPurposeId: "42" },
        { wgcFundId: "fund-2", aplosPurposeId: "77" },
      ],
    });
    expect(result.eligible).toBe(true);
    expect(result.contributions).toHaveLength(2);
    const dates = result.contributions.map((c) => c.originalDonationDate).sort();
    expect(dates).toEqual(["2026-01-15", "2026-01-16"]);
  });

  it("groups multiple donations on the same date into one contribution with multiple lines", async () => {
    const result = await setup({
      settlement: { totalAmountCents: 15000 },
      transfers: [
        { finixTransferId: "tr_1", paymentId: "pay-1" },
        { finixTransferId: "tr_2", paymentId: "pay-2", amountCents: 5000 },
      ],
      payments: [
        { id: "pay-1", createdAt: new Date("2026-01-15T09:00:00.000Z") },
        { id: "pay-2", createdAt: new Date("2026-01-15T20:00:00.000Z"), donationAmountCents: 5000, amountCents: 5000, actualFinixFeesCents: 200 },
      ],
    });
    expect(result.contributions).toHaveLength(1);
    expect(result.contributions[0].payload.lines).toHaveLength(2);
  });

  it("blocks the whole build when a donor-covered fee makes the contribution-amount policy unresolved", async () => {
    const result = await setup({ payments: [{ donationAmountCents: 10000, feeCoveredCents: 320, amountCents: 10320 }] });
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("POLICY_UNRESOLVED");
    expect(result.contributions).toHaveLength(0);
  });

  it("uses the donation amount directly when there is no donor-covered fee (receipt/statement agree)", async () => {
    const result = await setup({ payments: [{ donationAmountCents: 7500, amountCents: 7500 }] });
    expect(result.eligible).toBe(true);
    expect(result.contributions[0].payload.lines[0].amount).toBe(75);
  });

  it("is awaitingFees (not a hard block) when the processor fee hasn't synced yet", async () => {
    const result = await setup({ payments: [{ actualFinixFeesCents: null }] });
    expect(result.eligible).toBe(false);
    expect(result.awaitingFees).toBe(true);
    expect(result.contributions).toHaveLength(0);
  });

  it("is awaitingFees when the application fee hasn't synced yet", async () => {
    const result = await setup({ transfers: [{ applicationFeeCents: null }] });
    expect(result.eligible).toBe(false);
    expect(result.awaitingFees).toBe(true);
  });

  it("blocks when a fund is unmapped and there is no default purpose", async () => {
    const result = await setup({ mappings: [], accountConfig: { defaultPurposeId: null } });
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("MAPPING_REQUIRED");
  });

  it("falls back to the configured default purpose when a fund has no explicit mapping", async () => {
    const result = await setup({ mappings: [] });
    expect(result.eligible).toBe(true);
    expect(result.contributions[0].payload.lines[0].purpose.id).toBe(55);
  });

  it("blocks when settlement totals do not reconcile against included transfers", async () => {
    const result = await setup({ settlement: { totalAmountCents: 99999 } });
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("TOTALS_DO_NOT_RECONCILE");
  });

  it("blocks a settlement that is not SETTLED", async () => {
    const result = await setup({ settlement: { state: "PENDING" } });
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("NOT_SETTLED");
  });

  it("blocks a settlement with a refund adjustment", async () => {
    const result = await setup({ settlement: { refundAmountCents: 500 } });
    expect(result.reasons).toContain("UNSUPPORTED_ADJUSTMENTS");
  });

  it("blocks a settlement with a return adjustment", async () => {
    const result = await setup({ settlement: { returnAmountCents: 500 } });
    expect(result.reasons).toContain("UNSUPPORTED_ADJUSTMENTS");
  });

  it("blocks a settlement with a dispute adjustment", async () => {
    const result = await setup({ settlement: { disputeAmountCents: 500 } });
    expect(result.reasons).toContain("UNSUPPORTED_ADJUSTMENTS");
  });

  it("blocks a settlement with an other adjustment", async () => {
    const result = await setup({ settlement: { otherAdjustmentAmountCents: 500 } });
    expect(result.reasons).toContain("UNSUPPORTED_ADJUSTMENTS");
  });

  it("computes expense_amount as processor fee + application fee summed, in exact integer-cent-derived decimal dollars", async () => {
    const result = await setup({
      payments: [{ actualFinixFeesCents: 333 }],
      transfers: [{ applicationFeeCents: 111 }],
    });
    expect(result.contributions[0].payload.lines[0].expense_amount).toBeCloseTo(4.44, 5);
  });

  it("never introduces floating-point rounding error for an awkward cents value", async () => {
    const result = await setup({ payments: [{ donationAmountCents: 10007, amountCents: 10007 }] });
    expect(result.contributions[0].payload.lines[0].amount).toBe(100.07);
  });

  it("marks anonymous payments with a generic contact instead of the donor's real name", async () => {
    const result = await setup({ payments: [{ isAnonymous: true }] });
    expect(result.contributions[0].payload.lines[0].contact).toEqual({ firstname: "Anonymous", lastname: "Donor", type: "individual" });
  });

  it("produces a deterministic payload hash for identical input and a different hash when the amount changes", async () => {
    const resultA = await setup();
    const resultB = await setup();
    expect(resultA.contributions[0].payloadHash).toBe(resultB.contributions[0].payloadHash);

    const resultC = await setup({ payments: [{ donationAmountCents: 20000, amountCents: 20000 }] });
    expect(resultC.contributions[0].payloadHash).not.toBe(resultA.contributions[0].payloadHash);
  });

  it("sets is_ntd and ntd_amount when goods/services were provided", async () => {
    const result = await setup({ payments: [{ goodsServicesProvided: true, goodsServicesFairMarketValueCents: 1500 }] });
    expect(result.contributions[0].payload.lines[0].is_ntd).toBe(true);
    expect(result.contributions[0].payload.lines[0].ntd_amount).toBe(15);
  });
});
