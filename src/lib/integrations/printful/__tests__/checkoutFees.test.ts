import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Merchandise checkout previously carried no fee_profile at all on its
 * Finix transfer — WGC collected nothing on merch/shipping regardless of
 * the org's donation fee settings. These tests confirm the same fee
 * matrix and donor-covers-fee toggle donations already use now applies
 * here too.
 */

const mockResolveWgcTransferFeeStrategy = vi.fn();
vi.mock("@/lib/giving/serverFeeStrategy", () => ({ resolveWgcTransferFeeStrategy: mockResolveWgcTransferFeeStrategy }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    church: { findUnique: vi.fn() },
    givingLink: { findUnique: vi.fn(), update: vi.fn() },
    wgcCheckout: { findUnique: vi.fn(), create: vi.fn() },
    payment: { create: vi.fn() },
    finixTransfer: { upsert: vi.fn() },
  },
}));
vi.mock("@/lib/finix/sync/syncPaymentInstruments", () => ({ syncPaymentInstrument: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/finix/client", () => ({
  finixClient: { getPaymentInstrument: vi.fn(), createBuyerIdentity: vi.fn(), createPaymentInstrument: vi.fn(), createTransfer: vi.fn() },
}));
vi.mock("@/lib/billing/paymentRouting", () => ({
  resolveProcessingMerchant: vi.fn(),
  buildIdempotencyKey: (...parts: (string | number)[]) => parts.join(":"),
}));
vi.mock("@/lib/donors/resolveOrCreateDonor", () => ({ resolveOrCreateDonor: vi.fn() }));
vi.mock("@/lib/giving/generateReceipt", () => ({ sendDonationReceipt: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../orderService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../orderService")>();
  return { ...actual, priceCartServerSide: vi.fn(), getShippingQuote: vi.fn(), createMerchandiseOrder: vi.fn() };
});

const DONATION_CENTS = 10000; // $100
const SHIRT_CENTS = 2500; // $25
const SHIPPING_CENTS = 600; // $6
const BASE_TOTAL = DONATION_CENTS + SHIRT_CENTS + SHIPPING_CENTS; // $131

async function setup(givingLinkOverrides: Record<string, unknown> = {}) {
  vi.clearAllMocks();
  const { prisma } = await import("@/lib/prisma");
  const { finixClient } = await import("@/lib/finix/client");
  const { resolveProcessingMerchant } = await import("@/lib/billing/paymentRouting");
  const { resolveOrCreateDonor } = await import("@/lib/donors/resolveOrCreateDonor");
  const orderService = await import("../orderService");

  vi.mocked(prisma.church.findUnique).mockResolvedValue({ id: "church-a", finixMerchantId: "MU123", name: "Grace Church" } as never);
  vi.mocked(prisma.givingLink.findUnique).mockResolvedValue({ id: "link-1", churchId: "church-a", merchandiseEnabled: true, statementDescriptor: null, feeCoverEnabled: true, ...givingLinkOverrides } as never);
  vi.mocked(prisma.wgcCheckout.findUnique).mockResolvedValue(null as never);
  vi.mocked(prisma.payment.create).mockResolvedValue({ id: "payment-1" } as never);
  vi.mocked(prisma.wgcCheckout.create).mockImplementation((async ({ data }: any) => ({ id: "checkout-1", ...data })) as never);

  vi.mocked(finixClient.createBuyerIdentity).mockResolvedValue({ id: "ID123" } as never);
  vi.mocked(finixClient.createPaymentInstrument).mockResolvedValue({ id: "PI123", card: { brand: "VISA" } } as never);
  vi.mocked(finixClient.createTransfer).mockResolvedValue({ id: "TR123", state: "SUCCEEDED" } as never);

  vi.mocked(resolveProcessingMerchant).mockResolvedValue({ chargeType: "MERCHANT_MERCHANDISE_ORDER", organizationId: "church-a", merchantId: "MU123", isWgcBillingMerchant: false } as never);
  vi.mocked(resolveOrCreateDonor).mockResolvedValue({ id: "donor-1" } as never);

  vi.mocked(orderService.priceCartServerSide).mockResolvedValue({
    items: [{ variantId: "v1", productId: "p1", externalVariantId: "ext-v1", productName: "T-Shirt", variantName: "M/Black", size: "M", color: "Black", sku: "SKU1", imageUrl: null, quantity: 1, unitPrice: SHIRT_CENTS, lineTotal: SHIRT_CENTS, providerUnitCost: 1050, providerLineCost: 1050 }],
    subtotal: SHIRT_CENTS,
    providerCost: 1050,
  } as never);
  vi.mocked(orderService.getShippingQuote).mockResolvedValue({ options: [{ id: "mock-standard", name: "Standard", rate: SHIPPING_CENTS, minDays: 5, maxDays: 8 }] } as never);
  vi.mocked(orderService.createMerchandiseOrder).mockResolvedValue({ id: "merch-order-1" } as never);

  return { prisma, finixClient };
}

const baseCheckoutInput = {
  churchId: "church-a",
  givingLinkId: "link-1",
  cartItems: [{ variantId: "v1", quantity: 1 }],
  shippingOptionId: "mock-standard",
  address: { addressLine1: "123 Main St", city: "Austin", state: "TX", postalCode: "78701", country: "USA" },
  donor: { name: "Test Donor", email: "donor@example.com" },
  token: "tok_123",
  fraudSessionId: "fraud-session-1",
};

describe("processCombinedCheckout — WGC processing fee", () => {
  it("passes the resolved fee_profile onto the Finix transfer, org-paid by default", async () => {
    mockResolveWgcTransferFeeStrategy.mockReturnValue({
      feePaidBy: "ORGANIZATION",
      amountToChargeCents: BASE_TOTAL,
      expectedFeeCents: 255,
      supplementalFeeCents: 0,
      percentageBasisPoints: 230,
      fixedFeeCents: 25,
      normalizedCardBrand: "VISA",
      feeProfileId: "FP_ORG_PAID",
    });
    const { finixClient } = await setup({ feeCoverEnabled: false });
    const { processCombinedCheckout } = await import("../checkoutService");

    await processCombinedCheckout({ ...baseCheckoutInput, clientAttemptId: "attempt-org-paid", donationAmountCents: DONATION_CENTS, coverFees: false });

    expect(finixClient.createTransfer).toHaveBeenCalledWith(expect.objectContaining({ amount: BASE_TOTAL, fee_profile: "FP_ORG_PAID" }));
  });

  it("adds the supplemental fee on top of the charge when the donor covers it", async () => {
    const SUPPLEMENTAL_FEE = 305; // 3.0% + fixed, arbitrary for this test
    mockResolveWgcTransferFeeStrategy.mockReturnValue({
      feePaidBy: "DONOR",
      amountToChargeCents: BASE_TOTAL + SUPPLEMENTAL_FEE,
      expectedFeeCents: SUPPLEMENTAL_FEE,
      supplementalFeeCents: SUPPLEMENTAL_FEE,
      percentageBasisPoints: 300,
      fixedFeeCents: 0,
      normalizedCardBrand: "VISA",
      feeProfileId: "FP_DONOR_COVERED_ZERO",
    });
    const { finixClient, prisma } = await setup({ feeCoverEnabled: true });
    const { processCombinedCheckout } = await import("../checkoutService");

    const checkout = await processCombinedCheckout({ ...baseCheckoutInput, clientAttemptId: "attempt-donor-covers", donationAmountCents: DONATION_CENTS, coverFees: true });

    expect(finixClient.createTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ amount: BASE_TOTAL + SUPPLEMENTAL_FEE, fee_profile: "FP_DONOR_COVERED_ZERO", supplemental_fee: SUPPLEMENTAL_FEE })
    );
    expect(checkout.grandTotal).toBe(BASE_TOTAL + SUPPLEMENTAL_FEE);

    const paymentArgs = vi.mocked(prisma.payment.create).mock.calls[0][0] as any;
    expect(paymentArgs.data.donorCoversFee).toBe(true);
  });

  it("does not add a supplemental fee when the giving link has fee-cover disabled, even if coverFees is requested", async () => {
    mockResolveWgcTransferFeeStrategy.mockImplementation((input: any) => ({
      feePaidBy: "ORGANIZATION",
      amountToChargeCents: input.donationAmountCents,
      expectedFeeCents: 0,
      supplementalFeeCents: 0,
      percentageBasisPoints: 230,
      fixedFeeCents: 25,
      normalizedCardBrand: "VISA",
      feeProfileId: "FP_ORG_PAID",
    }));
    await setup({ feeCoverEnabled: false });
    const { processCombinedCheckout } = await import("../checkoutService");

    await processCombinedCheckout({ ...baseCheckoutInput, clientAttemptId: "attempt-disabled-cover", donationAmountCents: DONATION_CENTS, coverFees: true });

    // donorCoversFee passed into the fee-strategy resolver must be false —
    // the org's own feeCoverEnabled setting always gates this, matching
    // the donation flow's identical rule.
    expect(mockResolveWgcTransferFeeStrategy).toHaveBeenCalledWith(expect.objectContaining({ donorCoversFee: false }));
  });

  it("syncs a FinixTransfer row for the real charge, snapshots the payment instrument, and records the fee separately from the donation amount — previously all three were silently skipped on this checkout path even though the Finix charge itself succeeded", async () => {
    const SUPPLEMENTAL_FEE = 305;
    mockResolveWgcTransferFeeStrategy.mockReturnValue({
      feePaidBy: "DONOR",
      amountToChargeCents: BASE_TOTAL + SUPPLEMENTAL_FEE,
      expectedFeeCents: SUPPLEMENTAL_FEE,
      supplementalFeeCents: SUPPLEMENTAL_FEE,
      percentageBasisPoints: 300,
      fixedFeeCents: 0,
      normalizedCardBrand: "VISA",
      feeProfileId: "FP_DONOR_COVERED_ZERO",
    });
    const { finixClient, prisma } = await setup({ feeCoverEnabled: true });
    const { syncPaymentInstrument } = await import("@/lib/finix/sync/syncPaymentInstruments");
    const { processCombinedCheckout } = await import("../checkoutService");

    await processCombinedCheckout({ ...baseCheckoutInput, clientAttemptId: "attempt-sync-check", donationAmountCents: DONATION_CENTS, coverFees: true });

    expect(finixClient.createTransfer).toHaveBeenCalled();
    expect(prisma.finixTransfer.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { finixTransferId: "TR123" },
        create: expect.objectContaining({ finixTransferId: "TR123", churchId: "church-a", amountCents: BASE_TOTAL + SUPPLEMENTAL_FEE }),
      })
    );
    expect(syncPaymentInstrument).toHaveBeenCalledWith("PI123", { churchId: "church-a", donorId: "donor-1" });

    const paymentArgs = vi.mocked(prisma.payment.create).mock.calls[0][0] as any;
    expect(paymentArgs.data.amountCents).toBe(DONATION_CENTS);
    expect(paymentArgs.data.feeCoveredCents).toBe(SUPPLEMENTAL_FEE);
  });

  it("increments the giving link's attempt/success/collected stats on a successful checkout — previously this path never touched them at all, so a giving link with merchandise enabled always showed 0 attempts no matter how many real checkouts went through it", async () => {
    mockResolveWgcTransferFeeStrategy.mockReturnValue({
      feePaidBy: "ORGANIZATION",
      amountToChargeCents: BASE_TOTAL,
      expectedFeeCents: 255,
      supplementalFeeCents: 0,
      percentageBasisPoints: 230,
      fixedFeeCents: 25,
      normalizedCardBrand: "VISA",
      feeProfileId: "FP_ORG_PAID",
    });
    const { prisma } = await setup({ feeCoverEnabled: false });
    const { processCombinedCheckout } = await import("../checkoutService");

    await processCombinedCheckout({ ...baseCheckoutInput, clientAttemptId: "attempt-link-stats", donationAmountCents: DONATION_CENTS, coverFees: false });

    expect(prisma.givingLink.update).toHaveBeenCalledWith({
      where: { id: "link-1" },
      data: {
        totalAttempts: { increment: 1 },
        successfulDonations: { increment: 1 },
        totalCollectedCents: { increment: BASE_TOTAL },
        lastUsedAt: expect.any(Date),
      },
    });
  });

  it("uses the ACH fee matrix and records paymentMethodType BANK_ACCOUNT for a bank checkout — previously this whole checkout path always requested a CARD-rate fee_profile and always recorded PAYMENT_CARD, regardless of what was actually submitted", async () => {
    mockResolveWgcTransferFeeStrategy.mockReturnValue({
      feePaidBy: "ORGANIZATION",
      amountToChargeCents: BASE_TOTAL,
      expectedFeeCents: 25,
      supplementalFeeCents: 0,
      percentageBasisPoints: 0,
      fixedFeeCents: 25,
      normalizedCardBrand: "NONE",
      feeProfileId: "FP_ORG_PAID",
    });
    const { prisma } = await setup({ feeCoverEnabled: false });
    const { processCombinedCheckout } = await import("../checkoutService");

    await processCombinedCheckout({ ...baseCheckoutInput, clientAttemptId: "attempt-ach", donationAmountCents: DONATION_CENTS, coverFees: false, paymentMethod: "bank" });

    expect(mockResolveWgcTransferFeeStrategy).toHaveBeenCalledWith(expect.objectContaining({ paymentMethod: "ACH" }));

    const paymentArgs = vi.mocked(prisma.payment.create).mock.calls[0][0] as any;
    expect(paymentArgs.data.paymentMethodType).toBe("BANK_ACCOUNT");
  });

  it("truncates the ACH statement descriptor to 10 characters (Finix's stricter bank-transfer limit), not the 18-character card limit", async () => {
    mockResolveWgcTransferFeeStrategy.mockReturnValue({
      feePaidBy: "ORGANIZATION",
      amountToChargeCents: BASE_TOTAL,
      expectedFeeCents: 25,
      supplementalFeeCents: 0,
      percentageBasisPoints: 0,
      fixedFeeCents: 25,
      normalizedCardBrand: "NONE",
      feeProfileId: "FP_ORG_PAID",
    });
    const { finixClient } = await setup({ feeCoverEnabled: false });
    const { processCombinedCheckout } = await import("../checkoutService");

    await processCombinedCheckout({ ...baseCheckoutInput, clientAttemptId: "attempt-ach-descriptor", donationAmountCents: DONATION_CENTS, coverFees: false, paymentMethod: "bank" });

    const transferArgs = vi.mocked(finixClient.createTransfer).mock.calls[0][0] as any;
    expect(transferArgs.statement_descriptor.length).toBeLessThanOrEqual(10);
  });
});
