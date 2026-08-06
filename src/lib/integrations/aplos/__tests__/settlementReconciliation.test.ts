import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    finixSettlement: { findUnique: vi.fn() },
    finixTransfer: { findMany: vi.fn() },
    payment: { findMany: vi.fn() },
    aplosAccountConfiguration: { findUnique: vi.fn() },
    aplosPurposeMapping: { findMany: vi.fn() },
    aplosSyncRecord: { findFirst: vi.fn() },
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
  applicationFeeCents: 100 as number | null,
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
  actualFinixFeesCents: 320 as number | null,
  goodsServicesProvided: false,
  goodsServicesFairMarketValueCents: null as number | null,
};

const BASE_ACCOUNT_CONFIG = { churchId: "church-1", depositAccountId: "1000", processingFeeExpenseAccountId: "6000", defaultPurposeId: "55" as string | null };

async function setup(overrides: {
  settlement?: Partial<typeof BASE_SETTLEMENT> | null;
  transfers?: Partial<typeof BASE_TRANSFER>[];
  payments?: Partial<typeof BASE_PAYMENT>[];
  accountConfig?: Partial<typeof BASE_ACCOUNT_CONFIG> | null;
  mappings?: unknown[];
  alreadySynced?: unknown;
} = {}) {
  const { prisma } = await import("@/lib/prisma");
  vi.mocked(prisma.finixSettlement.findUnique).mockResolvedValue(
    overrides.settlement === null ? null : ({ ...BASE_SETTLEMENT, ...overrides.settlement } as never)
  );
  vi.mocked(prisma.finixTransfer.findMany).mockResolvedValue(
    (overrides.transfers ?? [BASE_TRANSFER]).map((t) => ({ ...BASE_TRANSFER, ...t })) as never
  );
  vi.mocked(prisma.payment.findMany).mockResolvedValue(
    (overrides.payments ?? [BASE_PAYMENT]).map((p) => ({ ...BASE_PAYMENT, ...p })) as never
  );
  vi.mocked(prisma.aplosAccountConfiguration.findUnique).mockResolvedValue(
    overrides.accountConfig === null ? null : ({ ...BASE_ACCOUNT_CONFIG, ...overrides.accountConfig } as never)
  );
  vi.mocked(prisma.aplosPurposeMapping.findMany).mockResolvedValue((overrides.mappings ?? [{ wgcFundId: "fund-1", aplosPurposeId: "42" }]) as never);
  vi.mocked(prisma.aplosSyncRecord.findFirst).mockResolvedValue((overrides.alreadySynced ?? null) as never);
  const { reconcileSettlement } = await import("../settlementReconciliation");
  return reconcileSettlement("stl_1", "church-1");
}

describe("reconcileSettlement", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is eligible for a clean, fully-mapped, SETTLED settlement", async () => {
    const result = await setup();
    expect(result.eligible).toBe(true);
    expect(result.awaitingFees).toBe(false);
    expect(result.snapshot?.payments).toHaveLength(1);
  });

  it("returns not found when the settlement doesn't belong to this church", async () => {
    const result = await setup({ settlement: null });
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("NOT_SETTLED");
    expect(result.snapshot).toBeNull();
  });

  it("blocks a settlement that is not yet SETTLED, ignoring reconciliationStatus", async () => {
    const result = await setup({ settlement: { state: "PENDING" } });
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("NOT_SETTLED");
  });

  it("blocks on any refund adjustment", async () => {
    const result = await setup({ settlement: { refundAmountCents: 500 } });
    expect(result.reasons).toContain("UNSUPPORTED_ADJUSTMENTS");
  });

  it("blocks on any return adjustment", async () => {
    const result = await setup({ settlement: { returnAmountCents: 500 } });
    expect(result.reasons).toContain("UNSUPPORTED_ADJUSTMENTS");
  });

  it("blocks on any dispute adjustment", async () => {
    const result = await setup({ settlement: { disputeAmountCents: 500 } });
    expect(result.reasons).toContain("UNSUPPORTED_ADJUSTMENTS");
  });

  it("blocks on any other adjustment", async () => {
    const result = await setup({ settlement: { otherAdjustmentAmountCents: 500 } });
    expect(result.reasons).toContain("UNSUPPORTED_ADJUSTMENTS");
  });

  it("blocks with NO_TRANSFERS when there are no successful transfers", async () => {
    const result = await setup({ transfers: [] });
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("NO_TRANSFERS");
    expect(result.snapshot).toBeNull();
  });

  it("blocks with MISSING_PAYMENT when a transfer has no resolvable payment", async () => {
    const result = await setup({ transfers: [{ paymentId: "pay-missing" }], payments: [] });
    expect(result.reasons).toContain("MISSING_PAYMENT");
  });

  it("sets awaitingFees (not a hard reason blob) when processor fee hasn't synced yet", async () => {
    const result = await setup({ payments: [{ actualFinixFeesCents: null }] });
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("MISSING_PROCESSOR_FEE");
    expect(result.awaitingFees).toBe(true);
  });

  it("sets awaitingFees when application fee hasn't synced yet", async () => {
    const result = await setup({ transfers: [{ applicationFeeCents: null }] });
    expect(result.reasons).toContain("MISSING_APPLICATION_FEE");
    expect(result.awaitingFees).toBe(true);
  });

  it("does not report awaitingFees when unsupported adjustments are also present", async () => {
    const result = await setup({ settlement: { refundAmountCents: 500 }, payments: [{ actualFinixFeesCents: null }] });
    expect(result.awaitingFees).toBe(false);
  });

  it("blocks with TOTALS_DO_NOT_RECONCILE when transfer sum disagrees with settlement total", async () => {
    const result = await setup({ settlement: { totalAmountCents: 99999 } });
    expect(result.reasons).toContain("TOTALS_DO_NOT_RECONCILE");
  });

  it("blocks with MAPPING_REQUIRED when a fund is unmapped and there's no default purpose", async () => {
    const result = await setup({ mappings: [], accountConfig: { defaultPurposeId: null } });
    expect(result.reasons).toContain("MAPPING_REQUIRED");
  });

  it("does not block on an unmapped fund when a default purpose is configured", async () => {
    const result = await setup({ mappings: [] });
    expect(result.reasons).not.toContain("MAPPING_REQUIRED");
  });

  it("blocks with ACCOUNT_CONFIGURATION_MISSING when no configuration is saved", async () => {
    const result = await setup({ accountConfig: null });
    expect(result.reasons).toContain("ACCOUNT_CONFIGURATION_MISSING");
  });

  it("blocks with ALREADY_SYNCED when a SYNCED record already exists", async () => {
    const result = await setup({ alreadySynced: { id: "sync-1" } });
    expect(result.reasons).toContain("ALREADY_SYNCED");
  });

  it("preserves each payment's donation, fee-covered, and total-charged amounts independently in the snapshot", async () => {
    const result = await setup({ payments: [{ donationAmountCents: 10000, feeCoveredCents: 320, amountCents: 10320 }] });
    const snap = result.snapshot!.payments[0];
    expect(snap.donationAmountCents).toBe(10000);
    expect(snap.feeCoveredCents).toBe(320);
    expect(snap.totalChargedCents).toBe(10320);
  });
});
