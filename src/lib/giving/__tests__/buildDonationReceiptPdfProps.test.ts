import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  church: { findUnique: vi.fn() },
  donor: { findUnique: vi.fn() },
  finixPaymentInstrumentSnapshot: { findUnique: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

async function loadModule() {
  vi.resetModules();
  return import("@/lib/giving/generateReceipt");
}

const church = {
  id: "church-1",
  name: "Test Church",
  statementSenderName: null,
  logoUrl: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  state: null,
  postalCode: null,
  supportEmail: null,
  primaryContactEmail: null,
  phone: null,
  website: null,
  taxId: null,
  receiptNumberPrefix: "TC",
};

const payment = {
  id: "payment-1",
  donorId: "donor-1",
  finixPaymentInstrumentId: null,
  finixTransferId: "TR123",
  isAnonymous: false,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  fundName: "General",
  paymentMethodType: "PAYMENT_CARD",
} as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.church.findUnique.mockResolvedValue(church);
  mockPrisma.donor.findUnique.mockResolvedValue({ id: "donor-1", name: "Jane Donor", email: "jane@example.com", anonymousPreference: false });
  mockPrisma.finixPaymentInstrumentSnapshot.findUnique.mockResolvedValue(null);
});

describe("buildDonationReceiptPdfProps", () => {
  it("uses the passed-in snapshot's financial/legal values, not anything freshly recomputed from the payment", async () => {
    const { buildDonationReceiptPdfProps } = await loadModule();
    const { props } = await buildDonationReceiptPdfProps(payment, "church-1", {
      receiptNumber: "TC-0001",
      paymentAmountCents: 5000,
      goodsServicesProvided: true,
      goodsServicesDescription: "A tote bag",
      goodsServicesFairMarketValueCents: 1000,
      recordedContributionAmountCents: 4000,
      acknowledgmentText: "Thank you for your generous gift, part of which was tax-deductible.",
    });

    expect(props.receiptNumber).toBe("TC-0001");
    expect(props.amountCents).toBe(5000);
    expect(props.goodsServicesProvided).toBe(true);
    expect(props.goodsServicesFairMarketValueCents).toBe(1000);
    expect(props.recordedContributionAmountCents).toBe(4000);
    expect(props.acknowledgmentText).toBe("Thank you for your generous gift, part of which was tax-deductible.");
  });

  it("this is exactly how a historical receipt view stays correct after a later goods/services correction — the OLD version's snapshot renders unchanged even if the payment's own fields have since been corrected", async () => {
    const { buildDonationReceiptPdfProps } = await loadModule();
    // Simulates viewing version 1 after the payment was later corrected to
    // goodsServicesProvided: false — version 1's own snapshot must still
    // show what was true when IT was sent.
    const { props } = await buildDonationReceiptPdfProps(payment, "church-1", {
      receiptNumber: "TC-0001",
      paymentAmountCents: 5000,
      goodsServicesProvided: true,
      goodsServicesDescription: "A tote bag",
      goodsServicesFairMarketValueCents: 1000,
      recordedContributionAmountCents: 4000,
      acknowledgmentText: "Version 1 acknowledgment text",
    });
    expect(props.goodsServicesProvided).toBe(true);
    expect(props.acknowledgmentText).toBe("Version 1 acknowledgment text");
  });

  it("uses the donor's current name/email (display details are live, not snapshotted)", async () => {
    const { buildDonationReceiptPdfProps } = await loadModule();
    const { props, donorEmail, donorName } = await buildDonationReceiptPdfProps(payment, "church-1", {
      receiptNumber: "TC-0001",
      paymentAmountCents: 5000,
      goodsServicesProvided: false,
      goodsServicesDescription: null,
      goodsServicesFairMarketValueCents: null,
      recordedContributionAmountCents: 5000,
      acknowledgmentText: "Thank you",
    });
    expect(donorName).toBe("Jane Donor");
    expect(donorEmail).toBe("jane@example.com");
    expect(props.donorEmail).toBe("jane@example.com");
  });

  it("suppresses donor name/email when the donor is anonymous", async () => {
    mockPrisma.donor.findUnique.mockResolvedValue({ id: "donor-1", name: "Jane Donor", email: "jane@example.com", anonymousPreference: true });
    const { buildDonationReceiptPdfProps } = await loadModule();
    const { props, donorName } = await buildDonationReceiptPdfProps(payment, "church-1", {
      receiptNumber: "TC-0001",
      paymentAmountCents: 5000,
      goodsServicesProvided: false,
      goodsServicesDescription: null,
      goodsServicesFairMarketValueCents: null,
      recordedContributionAmountCents: 5000,
      acknowledgmentText: "Thank you",
    });
    expect(donorName).toBe("Anonymous Donor");
    expect(props.donorEmail).toBeNull();
  });

  it("throws when the organization can't be found", async () => {
    mockPrisma.church.findUnique.mockResolvedValue(null);
    const { buildDonationReceiptPdfProps } = await loadModule();
    await expect(
      buildDonationReceiptPdfProps(payment, "church-1", {
        receiptNumber: "TC-0001",
        paymentAmountCents: 5000,
        goodsServicesProvided: false,
        goodsServicesDescription: null,
        goodsServicesFairMarketValueCents: null,
        recordedContributionAmountCents: 5000,
        acknowledgmentText: "Thank you",
      })
    ).rejects.toThrow("Organization not found");
  });
});
