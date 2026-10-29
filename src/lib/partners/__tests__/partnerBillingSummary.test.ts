import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  partner: { findUnique: vi.fn() },
  partnerBillableApproval: { findMany: vi.fn() },
  church: { findMany: vi.fn() },
  partnerInvoice: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/finix/client", () => ({ finixClient: {} }));
vi.mock("@/lib/billing/wgcBillingConfig", () => ({ getWgcBillingMerchantId: () => "MU", getConfiguredFinixEnvironment: () => "sandbox" }));
vi.mock("@/lib/email", () => ({ sendWgcEmail: vi.fn() }));
vi.mock("@/lib/audit", () => ({ createAuditLog: vi.fn() }));

import { loadPartnerBilling } from "../partnerBillingSummary";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.partnerBillableApproval.findMany.mockResolvedValue([{ churchId: "c1" }, { churchId: "c2" }]);
  prismaMock.church.findMany.mockResolvedValue([
    { id: "c1", name: "A", partnerReference: null },
    { id: "c2", name: "B", partnerReference: null },
  ]);
  prismaMock.partnerInvoice.findMany.mockResolvedValue([]);
});

describe("loadPartnerBilling", () => {
  it("projects next month's charge from the merchants that will count then", async () => {
    prismaMock.partner.findUnique.mockResolvedValue({ pricePerMerchantCents: 2500, billingPaymentInstrumentId: "PI_1", cardBrand: "VISA", cardLast4: "4242", cardExpMonth: 12, cardExpYear: 2030 });
    const summary = await loadPartnerBilling("p1", new Date("2026-10-29T12:00:00Z"));
    expect(summary?.next).toEqual({ period: "2026-11", chargeDate: "2026-11-01T00:00:00.000Z", merchantCount: 2, amountCents: 5000 });
    expect(prismaMock.partnerBillableApproval.findMany.mock.calls[0][0].where).toEqual({ partnerId: "p1", status: "PENDING", approvedAt: { lt: new Date("2026-11-01T00:00:00Z") } });
  });

  it("rolls over the year", async () => {
    prismaMock.partner.findUnique.mockResolvedValue({ pricePerMerchantCents: 100, billingPaymentInstrumentId: null, cardBrand: null, cardLast4: null, cardExpMonth: null, cardExpYear: null });
    expect((await loadPartnerBilling("p1", new Date("2026-12-15T00:00:00Z")))?.next.period).toBe("2027-01");
  });

  it("shows no amount until a price is set, and no card until one is saved", async () => {
    prismaMock.partner.findUnique.mockResolvedValue({ pricePerMerchantCents: null, billingPaymentInstrumentId: null, cardBrand: null, cardLast4: null, cardExpMonth: null, cardExpYear: null });
    const summary = await loadPartnerBilling("p1");
    expect(summary?.pricePerMerchantCents).toBeNull();
    expect(summary?.next.amountCents).toBeNull();
    expect(summary?.card).toBeNull();
  });

  it("only shows the card's brand, last four and expiry, and only this partner's invoices", async () => {
    prismaMock.partner.findUnique.mockResolvedValue({ pricePerMerchantCents: 2500, billingPaymentInstrumentId: "PI_SECRET", cardBrand: "VISA", cardLast4: "4242", cardExpMonth: 1, cardExpYear: 2031 });
    prismaMock.partnerInvoice.findMany.mockResolvedValue([
      { id: "i1", period: "2026-10", merchantCount: 2, unitPriceCents: 2500, amountCents: 5000, status: "FAILED", chargedAt: null, failureReason: "Card was declined", finixTransferId: "TR_SECRET", lineItemsJson: [] },
      { id: "i2", period: "2026-09", merchantCount: 1, unitPriceCents: 2500, amountCents: 2500, status: "SUCCEEDED", chargedAt: new Date("2026-09-02T00:00:00Z"), failureReason: "old", finixTransferId: "TR_2", lineItemsJson: [] },
    ]);
    const summary = await loadPartnerBilling("p1");
    expect(prismaMock.partnerInvoice.findMany.mock.calls[0][0].where).toEqual({ partnerId: "p1" });
    const text = JSON.stringify(summary);
    expect(text).not.toContain("PI_SECRET");
    expect(text).not.toContain("TR_SECRET");
    expect(summary?.invoices[0].failureReason).toBe("Card was declined");
    expect(summary?.invoices[1].failureReason).toBeNull(); // a failure reason is only shown while it still applies
  });

  it("is null for an unknown partner", async () => {
    prismaMock.partner.findUnique.mockResolvedValue(null);
    expect(await loadPartnerBilling("nope")).toBeNull();
  });
});
