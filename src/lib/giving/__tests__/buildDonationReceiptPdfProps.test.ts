import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

  it("always shows the real donor name/email on the receipt itself, even when the donor has anonymousPreference set — 2026-09-07 fix: anonymousPreference means 'don't show my name publicly', it must never blank a donor's own name on their own private tax receipt", async () => {
    mockPrisma.donor.findUnique.mockResolvedValue({ id: "donor-1", name: "Jane Donor", email: "jane@example.com", anonymousPreference: true });
    const { buildDonationReceiptPdfProps } = await loadModule();
    const { props, donorName, donorEmail } = await buildDonationReceiptPdfProps(payment, "church-1", {
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

  it("same fix applies when it's the specific Payment (not the donor's standing profile) that's marked isAnonymous", async () => {
    mockPrisma.donor.findUnique.mockResolvedValue({ id: "donor-1", name: "Jane Donor", email: "jane@example.com", anonymousPreference: false });
    const { buildDonationReceiptPdfProps } = await loadModule();
    const { donorName, donorEmail } = await buildDonationReceiptPdfProps({ ...payment, isAnonymous: true }, "church-1", {
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

  describe("donor-covered fee on the receipt", () => {
    const snapshot = {
      receiptNumber: "TC-0001",
      paymentAmountCents: 25000,
      goodsServicesProvided: false,
      goodsServicesDescription: null,
      goodsServicesFairMarketValueCents: null,
      recordedContributionAmountCents: 25000,
      acknowledgmentText: "Thank you",
    };

    it("is passed to the receipt when the church turned the setting on and the donor covered a fee", async () => {
      mockPrisma.church.findUnique.mockResolvedValue({ ...church, receiptShowDonorCoveredFee: true });
      const { buildDonationReceiptPdfProps } = await loadModule();
      const { props } = await buildDonationReceiptPdfProps({ ...payment, feeCoveredCents: 25 }, "church-1", snapshot);
      expect(props.amountCents).toBe(25000); // the gift itself is unchanged
      expect(props.donorCoveredFeeCents).toBe(25);
    });

    it("is NOT shown when the setting is off (the default), even if the donor covered a fee", async () => {
      const { buildDonationReceiptPdfProps } = await loadModule();
      const { props } = await buildDonationReceiptPdfProps({ ...payment, feeCoveredCents: 25 }, "church-1", snapshot);
      expect(props.donorCoveredFeeCents).toBe(0);
    });

    it("is NOT shown when the donor didn't cover a fee, even with the setting on", async () => {
      mockPrisma.church.findUnique.mockResolvedValue({ ...church, receiptShowDonorCoveredFee: true });
      const { buildDonationReceiptPdfProps } = await loadModule();
      for (const fee of [0, null, undefined]) {
        const { props } = await buildDonationReceiptPdfProps({ ...payment, feeCoveredCents: fee }, "church-1", snapshot);
        expect(props.donorCoveredFeeCents).toBe(0);
      }
    });

    it("coveredFeeForReceipt only ever returns a positive fee, and only when the setting is on", async () => {
      const { coveredFeeForReceipt } = await loadModule();
      expect(coveredFeeForReceipt(true, 25)).toBe(25);
      expect(coveredFeeForReceipt(false, 25)).toBe(0);
      expect(coveredFeeForReceipt(true, 0)).toBe(0);
      expect(coveredFeeForReceipt(true, -5)).toBe(0);
      expect(coveredFeeForReceipt(true, null)).toBe(0);
    });
  });

  describe("organization logo", () => {
    const snapshot = {
      receiptNumber: "TC-0001",
      paymentAmountCents: 5000,
      goodsServicesProvided: false,
      goodsServicesDescription: null,
      goodsServicesFairMarketValueCents: null,
      recordedContributionAmountCents: 5000,
      acknowledgmentText: "Thank you",
    };
    const logoUrl = "https://abc.supabase.co/storage/v1/object/public/branding/church-1/logo.png";
    const fetchMock = vi.fn();
    beforeEach(() => {
      vi.stubEnv("SUPABASE_URL", "https://abc.supabase.co");
      vi.stubGlobal("fetch", fetchMock);
      mockPrisma.church.findUnique.mockResolvedValue({ ...church, logoUrl });
    });
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    });

    it("passes a PNG/JPEG logo to the PDF as bytes, never as a URL", async () => {
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
      fetchMock.mockResolvedValue(new Response(new Uint8Array(png)));
      const { buildDonationReceiptPdfProps } = await loadModule();
      const { props } = await buildDonationReceiptPdfProps(payment, "church-1", snapshot);
      expect(props.organizationLogo).toEqual({ data: png, format: "png" });
    });

    it("drops a WebP or unreachable logo but still builds the receipt", async () => {
      const { buildDonationReceiptPdfProps } = await loadModule();
      fetchMock.mockResolvedValue(new Response(new Uint8Array(Buffer.from("RIFF\u0000\u0000\u0000\u0000WEBP", "latin1"))));
      expect((await buildDonationReceiptPdfProps(payment, "church-1", snapshot)).props.organizationLogo).toBeNull();
      fetchMock.mockRejectedValue(new Error("network down"));
      const { props } = await buildDonationReceiptPdfProps(payment, "church-1", snapshot);
      expect(props.organizationLogo).toBeNull();
      expect(props.receiptNumber).toBe("TC-0001");
    });
  });
});
