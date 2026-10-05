import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma: any = {
  promoShortfallCharge: { findUnique: vi.fn(), update: vi.fn() },
  wgcSubscription: { findUnique: vi.fn() },
  billingCharge: { create: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

const mockCreateTransfer = vi.fn();
vi.mock("@/lib/finix/client", () => ({ finixClient: { createTransfer: (...args: unknown[]) => mockCreateTransfer(...args) } }));

const mockLogBillingAuditEvent = vi.fn();
vi.mock("@/lib/billing/billingAudit", () => ({ logBillingAuditEvent: (...args: unknown[]) => mockLogBillingAuditEvent(...args) }));

vi.mock("@/lib/billing/paymentRouting", () => ({
  resolveProcessingMerchant: vi.fn().mockResolvedValue({ chargeType: "WGC_PLATFORM_SUBSCRIPTION", organizationId: "church-A", merchantId: "MU_wgc_billing", isWgcBillingMerchant: true }),
  buildTrustedFinixTags: vi.fn().mockReturnValue({ wgc_organization_id: "church-A" }),
  buildIdempotencyKey: vi.fn((...parts: unknown[]) => parts.join(":")),
}));

async function load() {
  vi.resetModules();
  return import("../promoShortfallCharge");
}

const ACTOR = { userId: "admin-1", email: "admin@wgc.example", role: "wgc_admin" };

const SHORTFALL = {
  id: "shortfall-1",
  organizationId: "church-A",
  billingPeriod: "2026-02",
  processedVolumeCents: 5000,
  thresholdCents: 10_000,
  chargeAmountCents: 1000,
  currency: "USD",
  status: "FLAGGED",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.promoShortfallCharge.findUnique.mockResolvedValue({ ...SHORTFALL });
  mockPrisma.wgcSubscription.findUnique.mockResolvedValue({ id: "sub-1", finixSubscriptionId: "fx_sub_1", priceVersionId: "price-1", billingPaymentInstrumentId: "PI_123" });
  mockCreateTransfer.mockResolvedValue({ id: "TR_123", state: "SUCCEEDED" });
  mockPrisma.billingCharge.create.mockResolvedValue({ id: "charge-1" });
  mockPrisma.promoShortfallCharge.update.mockImplementation((args: any) => Promise.resolve({ ...SHORTFALL, ...args.data }));
});

describe("chargePromoShortfall", () => {
  it("charges the org's on-file payment method through the WGC billing merchant, never the org's own merchant", async () => {
    const { chargePromoShortfall } = await load();
    await chargePromoShortfall("shortfall-1", ACTOR);

    expect(mockCreateTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ merchant: "MU_wgc_billing", amount: 1000, source: "PI_123" })
    );
  });

  it("refuses to charge when the org has no payment method on file — never silently skips or charges $0", async () => {
    mockPrisma.wgcSubscription.findUnique.mockResolvedValue({ id: "sub-1", billingPaymentInstrumentId: null });
    const { chargePromoShortfall, PromoShortfallChargeError } = await load();

    await expect(chargePromoShortfall("shortfall-1", ACTOR)).rejects.toThrow(PromoShortfallChargeError);
    expect(mockCreateTransfer).not.toHaveBeenCalled();
  });

  it("is a no-op (not an error, not a second charge) when the shortfall was already charged", async () => {
    mockPrisma.promoShortfallCharge.findUnique.mockResolvedValue({ ...SHORTFALL, status: "CHARGED" });
    const { chargePromoShortfall } = await load();

    const result = await chargePromoShortfall("shortfall-1", ACTOR);

    expect(mockCreateTransfer).not.toHaveBeenCalled();
    expect(result.status).toBe("CHARGED");
  });

  it("refuses to charge a shortfall that was already waived", async () => {
    mockPrisma.promoShortfallCharge.findUnique.mockResolvedValue({ ...SHORTFALL, status: "WAIVED" });
    const { chargePromoShortfall, PromoShortfallChargeError } = await load();

    await expect(chargePromoShortfall("shortfall-1", ACTOR)).rejects.toThrow(PromoShortfallChargeError);
    expect(mockCreateTransfer).not.toHaveBeenCalled();
  });

  it("records CHARGE_FAILED (not CHARGED) and never creates a BillingCharge row when Finix rejects the transfer", async () => {
    mockCreateTransfer.mockRejectedValue(new Error("card_declined"));
    const { chargePromoShortfall, PromoShortfallChargeError } = await load();

    await expect(chargePromoShortfall("shortfall-1", ACTOR)).rejects.toThrow(PromoShortfallChargeError);

    expect(mockPrisma.billingCharge.create).not.toHaveBeenCalled();
    expect(mockPrisma.promoShortfallCharge.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "CHARGE_FAILED", failureMessage: expect.stringContaining("card_declined") }) })
    );
  });

  it("creates a BillingCharge row with chargeType BILLING_ADJUSTMENT and marks the shortfall CHARGED on success", async () => {
    const { chargePromoShortfall } = await load();
    await chargePromoShortfall("shortfall-1", ACTOR);

    expect(mockPrisma.billingCharge.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ chargeType: "BILLING_ADJUSTMENT", organizationId: "church-A", amountCents: 1000, finixTransferId: "TR_123" }) })
    );
    expect(mockPrisma.promoShortfallCharge.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "CHARGED", chargedByUserId: "admin-1", finixTransferId: "TR_123" }) })
    );
    expect(mockLogBillingAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "promo_shortfall.charged" }));
  });

  it("returns an error (not a thrown exception the caller can't handle) for a nonexistent shortfall id", async () => {
    mockPrisma.promoShortfallCharge.findUnique.mockResolvedValue(null);
    const { chargePromoShortfall, PromoShortfallChargeError } = await load();

    await expect(chargePromoShortfall("does-not-exist", ACTOR)).rejects.toThrow(PromoShortfallChargeError);
  });
});

describe("waivePromoShortfall", () => {
  it("requires a reason to be persisted and audit-logged", async () => {
    const { waivePromoShortfall } = await load();
    await waivePromoShortfall("shortfall-1", ACTOR, "Org had a documented outage this month");

    expect(mockPrisma.promoShortfallCharge.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "WAIVED", waiveReason: "Org had a documented outage this month", waivedByUserId: "admin-1" }) })
    );
    expect(mockLogBillingAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "promo_shortfall.waived" }));
  });

  it("refuses to waive a shortfall that was already charged", async () => {
    mockPrisma.promoShortfallCharge.findUnique.mockResolvedValue({ ...SHORTFALL, status: "CHARGED" });
    const { waivePromoShortfall, PromoShortfallChargeError } = await load();

    await expect(waivePromoShortfall("shortfall-1", ACTOR, "reason")).rejects.toThrow(PromoShortfallChargeError);
  });
});
