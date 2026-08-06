import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  invoiceSettings: { findUnique: vi.fn() },
  church: { findUnique: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

async function importFn() {
  vi.resetModules();
  return import("../invoiceBranding");
}

describe("resolveInvoiceBranding", () => {
  beforeEach(() => vi.clearAllMocks());

  it("falls back to the church name when no organizationDisplayName is set", async () => {
    const { resolveInvoiceBranding } = await importFn();
    mockPrisma.invoiceSettings.findUnique.mockResolvedValue(null);
    mockPrisma.church.findUnique.mockResolvedValue({ name: "First Church", logoUrl: null, primaryContactEmail: "a@b.com" });
    const branding = await resolveInvoiceBranding("church-1");
    expect(branding.organizationDisplayName).toBe("First Church");
  });

  it("prefers a dedicated invoice logo over the church's primary logo", async () => {
    const { resolveInvoiceBranding } = await importFn();
    mockPrisma.invoiceSettings.findUnique.mockResolvedValue({ invoiceLogoUrl: "https://x/invoice-logo.png" });
    mockPrisma.church.findUnique.mockResolvedValue({ name: "First Church", logoUrl: "https://x/church-logo.png", primaryContactEmail: "a@b.com" });
    const branding = await resolveInvoiceBranding("church-1");
    expect(branding.logoUrl).toBe("https://x/invoice-logo.png");
  });

  it("falls back to the church's primary logo when no invoice-specific logo is set", async () => {
    const { resolveInvoiceBranding } = await importFn();
    mockPrisma.invoiceSettings.findUnique.mockResolvedValue({ invoiceLogoUrl: null });
    mockPrisma.church.findUnique.mockResolvedValue({ name: "First Church", logoUrl: "https://x/church-logo.png", primaryContactEmail: "a@b.com" });
    const branding = await resolveInvoiceBranding("church-1");
    expect(branding.logoUrl).toBe("https://x/church-logo.png");
  });

  it("returns null (never a fake placeholder) when no logo exists anywhere", async () => {
    const { resolveInvoiceBranding } = await importFn();
    mockPrisma.invoiceSettings.findUnique.mockResolvedValue(null);
    mockPrisma.church.findUnique.mockResolvedValue({ name: "First Church", logoUrl: null, primaryContactEmail: "a@b.com" });
    const branding = await resolveInvoiceBranding("church-1");
    expect(branding.logoUrl).toBeNull();
  });

  it("uses a sensible default accent color when none is configured", async () => {
    const { resolveInvoiceBranding } = await importFn();
    mockPrisma.invoiceSettings.findUnique.mockResolvedValue(null);
    mockPrisma.church.findUnique.mockResolvedValue({ name: "First Church", logoUrl: null, primaryContactEmail: null });
    const branding = await resolveInvoiceBranding("church-1");
    expect(branding.accentColor).toBeTruthy();
  });
});

describe("applyInvoiceOverrides", () => {
  it("applies a per-invoice template/accent-color override on top of church-wide branding", async () => {
    const { applyInvoiceOverrides } = await importFn();
    const base = {
      logoUrl: null, organizationDisplayName: "X", organizationLegalName: null, organizationAddress: null,
      organizationPhone: null, organizationSupportEmail: null, organizationWebsite: null, taxRegistrationNumber: null,
      invoiceNumberPrefix: "INV-", templateName: "CLASSIC", accentColor: "#1d4ed8", footerMessage: null,
      thankYouMessage: null, defaultMemo: null, defaultTerms: null, defaultPaymentInstructions: null,
      replyToEmail: null, showWgcBranding: true,
    };
    const result = applyInvoiceOverrides(base, { templateName: "MODERN", accentColor: "#ff0000" });
    expect(result.templateName).toBe("MODERN");
    expect(result.accentColor).toBe("#ff0000");
  });

  it("keeps the church-wide default when the invoice has no override", async () => {
    const { applyInvoiceOverrides } = await importFn();
    const base = {
      logoUrl: null, organizationDisplayName: "X", organizationLegalName: null, organizationAddress: null,
      organizationPhone: null, organizationSupportEmail: null, organizationWebsite: null, taxRegistrationNumber: null,
      invoiceNumberPrefix: "INV-", templateName: "CLASSIC", accentColor: "#1d4ed8", footerMessage: null,
      thankYouMessage: null, defaultMemo: null, defaultTerms: null, defaultPaymentInstructions: null,
      replyToEmail: null, showWgcBranding: true,
    };
    const result = applyInvoiceOverrides(base, { templateName: "", accentColor: null });
    expect(result.templateName).toBe("CLASSIC");
    expect(result.accentColor).toBe("#1d4ed8");
  });
});
