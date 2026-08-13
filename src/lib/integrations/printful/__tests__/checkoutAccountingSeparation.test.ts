import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Spec item 66 — the critical accounting test:
 *   Donation = $100, Shirt = $25, Shipping = $6, Total charged = $131.
 * Expected: donation reporting = $100, merchandise sales = $25, shipping
 * collected = $6, Finix charge = $131. There must be NO path where WGC
 * reports "Donation = $131".
 */

vi.mock("@/lib/prisma", () => ({
  prisma: {
    church: { findUnique: vi.fn() },
    givingLink: { findUnique: vi.fn() },
    wgcCheckout: { findUnique: vi.fn(), create: vi.fn() },
    payment: { create: vi.fn() },
  },
}));
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
  return {
    ...actual,
    priceCartServerSide: vi.fn(),
    getShippingQuote: vi.fn(),
    createMerchandiseOrder: vi.fn(),
  };
});

const DONATION_CENTS = 10000; // $100
const SHIRT_CENTS = 2500; // $25
const SHIPPING_CENTS = 600; // $6
const GRAND_TOTAL = DONATION_CENTS + SHIRT_CENTS + SHIPPING_CENTS; // $131

describe("processCombinedCheckout — critical accounting separation (spec item 66)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { prisma } = await import("@/lib/prisma");
    const { finixClient } = await import("@/lib/finix/client");
    const { resolveProcessingMerchant } = await import("@/lib/billing/paymentRouting");
    const { resolveOrCreateDonor } = await import("@/lib/donors/resolveOrCreateDonor");
    const orderService = await import("../orderService");

    vi.mocked(prisma.church.findUnique).mockResolvedValue({ id: "church-a", finixMerchantId: "MU123", name: "Grace Church" } as never);
    vi.mocked(prisma.givingLink.findUnique).mockResolvedValue({ id: "link-1", churchId: "church-a", merchandiseEnabled: true, statementDescriptor: null } as never);
    vi.mocked(prisma.wgcCheckout.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.payment.create).mockResolvedValue({ id: "payment-1" } as never);
    vi.mocked(prisma.wgcCheckout.create).mockImplementation((async ({ data }: any) => ({ id: "checkout-1", ...data })) as never);

    vi.mocked(finixClient.getPaymentInstrument).mockResolvedValue({ id: "PI123", identity: "ID123" } as never);
    vi.mocked(finixClient.createBuyerIdentity).mockResolvedValue({ id: "ID123" } as never);
    vi.mocked(finixClient.createPaymentInstrument).mockResolvedValue({ id: "PI123" } as never);
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
  });

  it("charges Finix exactly the grand total but records the Payment's donationAmountCents as ONLY the donation portion", async () => {
    const { finixClient } = await import("@/lib/finix/client");
    const { prisma } = await import("@/lib/prisma");
    const { processCombinedCheckout } = await import("../checkoutService");

    const checkout = await processCombinedCheckout({
      churchId: "church-a",
      givingLinkId: "link-1",
      clientAttemptId: "attempt-1",
      donationAmountCents: DONATION_CENTS,
      cartItems: [{ variantId: "v1", quantity: 1 }],
      shippingOptionId: "mock-standard",
      address: { addressLine1: "123 Main St", city: "Austin", state: "TX", postalCode: "78701", country: "USA" },
      donor: { name: "Test Donor", email: "donor@example.com" },
      token: "tok_123",
      fraudSessionId: "fraud-session-1",
    });

    // Finix is charged the full grand total — one single charge (spec item 73).
    expect(finixClient.createTransfer).toHaveBeenCalledWith(expect.objectContaining({ amount: GRAND_TOTAL }));

    // The Payment row (the ONLY table donation reporting reads from) must
    // record ONLY the donation portion — never the grand total.
    expect(prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ amountCents: DONATION_CENTS, donationAmountCents: DONATION_CENTS }),
      })
    );
    const paymentCallArgs = vi.mocked(prisma.payment.create).mock.calls[0][0] as any;
    expect(paymentCallArgs.data.amountCents).not.toBe(GRAND_TOTAL);
    expect(paymentCallArgs.data.donationAmountCents).not.toBe(GRAND_TOTAL);

    // The checkout record keeps every component separate and distinguishable.
    expect(checkout.donationAmount).toBe(DONATION_CENTS);
    expect(checkout.merchandiseAmount).toBe(SHIRT_CENTS);
    expect(checkout.shippingAmount).toBe(SHIPPING_CENTS);
    expect(checkout.grandTotal).toBe(GRAND_TOTAL);
    expect(checkout.donationAmount + checkout.merchandiseAmount + checkout.shippingAmount + checkout.taxAmount).toBe(checkout.grandTotal);
  });

  it("never creates a Payment row at all for a merchandise-only checkout (donationAmountCents = 0)", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { processCombinedCheckout } = await import("../checkoutService");

    await processCombinedCheckout({
      churchId: "church-a",
      givingLinkId: "link-1",
      clientAttemptId: "attempt-2",
      donationAmountCents: 0,
      cartItems: [{ variantId: "v1", quantity: 1 }],
      shippingOptionId: "mock-standard",
      address: { addressLine1: "123 Main St", city: "Austin", state: "TX", postalCode: "78701", country: "USA" },
      donor: { name: "Test Donor", email: "donor@example.com" },
      token: "tok_123",
      fraudSessionId: "fraud-session-1",
    });

    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it("is idempotent — a retried clientAttemptId returns the existing checkout instead of charging again", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { finixClient } = await import("@/lib/finix/client");
    vi.mocked(prisma.wgcCheckout.findUnique).mockResolvedValue({ id: "existing-checkout", clientAttemptId: "attempt-3" } as never);

    const { processCombinedCheckout } = await import("../checkoutService");
    const result = await processCombinedCheckout({
      churchId: "church-a",
      givingLinkId: "link-1",
      clientAttemptId: "attempt-3",
      donationAmountCents: DONATION_CENTS,
      cartItems: [],
      shippingOptionId: null,
      address: null,
      donor: { name: "Test Donor", email: "donor@example.com" },
      token: "tok_123",
      fraudSessionId: "fraud-session-1",
    });

    expect(result).toEqual({ id: "existing-checkout", clientAttemptId: "attempt-3" });
    expect(finixClient.createTransfer).not.toHaveBeenCalled();
  });
});
