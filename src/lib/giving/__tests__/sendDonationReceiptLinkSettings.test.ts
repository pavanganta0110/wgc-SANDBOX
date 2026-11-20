import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  sendWgcEmail: vi.fn(),
  prisma: {
    payment: { findFirst: vi.fn(), update: vi.fn() },
    church: { findUnique: vi.fn() },
    givingLink: { findFirst: vi.fn() },
    donationReceipt: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
  },
}));
vi.mock("@/lib/email", () => ({ sendWgcEmail: h.sendWgcEmail }));
vi.mock("@/lib/prisma", () => ({ prisma: h.prisma }));
vi.mock("@react-pdf/renderer", () => ({ renderToBuffer: vi.fn().mockResolvedValue(Buffer.from("pdf")) }));
vi.mock("@/lib/giving/pdf/DonationReceiptPdf", () => ({ DonationReceiptPdf: vi.fn() }));
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn() }));
vi.mock("@/lib/settings/notificationDispatch", () => ({ notifyEvent: vi.fn() }));
vi.mock("@/lib/pdf/pdfImage", () => ({ loadPdfImage: vi.fn().mockResolvedValue(null) }));

import { sendDonationReceipt } from "../generateReceipt";

const church = {
  id: "c1",
  name: "Collegiate Impact Incorporated",
  publicDisplayName: "Collegiate Impact",
  statementSenderName: null,
  logoUrl: null,
  receiptNumberPrefix: "CI",
};

function setup(linkReceipt: unknown) {
  h.prisma.payment.findFirst.mockResolvedValue({
    id: "p1", churchId: "c1", donorId: "d1", givingLinkId: "l1", amountCents: 5000, donationAmountCents: 5000,
    createdAt: new Date("2026-11-20T18:00:00Z"), receiptNumber: null, finixPaymentInstrumentId: null,
  });
  h.prisma.church.findUnique.mockResolvedValue(church);
  h.prisma.givingLink.findFirst.mockResolvedValue({ receiptSettingsJson: linkReceipt });
  h.prisma.donationReceipt.findFirst.mockResolvedValue(null);
  h.sendWgcEmail.mockResolvedValue({ success: true });
  // buildDonationReceiptPdfProps reads donor + instrument through prisma too
  (h.prisma as any).donor = { findUnique: vi.fn().mockResolvedValue({ name: "Karen Hagans", email: "karen@example.com" }) };
  (h.prisma as any).finixPaymentInstrumentSnapshot = { findUnique: vi.fn().mockResolvedValue(null) };
}

beforeEach(() => vi.clearAllMocks());

describe("sendDonationReceipt uses the giving link's own receipt settings", () => {
  it("applies the link's subject, sender, reply-to and custom message, and the display name", async () => {
    setup({ subject: "Your End-of-Year gift to [Organization Name]", senderName: "Britney at CI", replyTo: "britney@collegiateimpact.org", customMessage: "You made a difference.\nSee you in 2027.", includeTaxLanguage: true, sendAutomatically: true });
    await sendDonationReceipt("p1", "c1");
    const arg = h.sendWgcEmail.mock.calls[0][0];
    expect(arg.subject).toBe("Your End-of-Year gift to Collegiate Impact");
    expect(arg.senderName).toBe("Britney at CI");
    expect(arg.replyTo).toBe("britney@collegiateimpact.org");
    expect(arg.bodyHtml).toContain("You made a difference.<br/>See you in 2027.");
    expect(arg.bodyHtml).toContain("<strong>Collegiate Impact</strong>");
    expect(arg.bodyHtml).not.toContain("Incorporated");
  });

  it("drops the tax wording when the link turns it off", async () => {
    setup({ includeTaxLanguage: false });
    await sendDonationReceipt("p1", "c1");
    const html = h.sendWgcEmail.mock.calls[0][0].bodyHtml as string;
    expect(html).not.toMatch(/tax/i);
  });

  it("falls back to the organization-wide receipt settings when the link has none", async () => {
    setup(null);
    await sendDonationReceipt("p1", "c1");
    const arg = h.sendWgcEmail.mock.calls[0][0];
    expect(arg.subject).toContain("Collegiate Impact");
    expect(arg.replyTo).toBeUndefined();
  });
});
