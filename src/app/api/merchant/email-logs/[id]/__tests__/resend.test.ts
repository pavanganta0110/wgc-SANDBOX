import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuth = {
  userId: "user-1",
  email: "owner@example.com",
  churchId: "church-1",
  rawRole: "owner",
  role: "owner",
  isWgcAdmin: false,
  permissionsJson: null,
  authVersion: 1,
  authTime: null,
};
vi.mock("@/lib/auth/requireMerchantSession", () => ({ requireMerchantSession: vi.fn().mockResolvedValue(mockAuth) }));
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: vi.fn() }));

const mockSendDonationReceipt = vi.fn().mockResolvedValue({ receiptNumber: "R-1", recipientEmail: "donor@example.com", version: 1 });
vi.mock("@/lib/giving/generateReceipt", () => ({ sendDonationReceipt: (...a: unknown[]) => mockSendDonationReceipt(...a) }));

const mockSendExternalDonationReceiptEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/donations/sendExternalDonationReceiptEmail", () => ({
  sendExternalDonationReceiptEmail: (...a: unknown[]) => mockSendExternalDonationReceiptEmail(...a),
}));

vi.mock("@/lib/donors/generateStatement", () => ({ sendYearEndStatementEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/invoices/invoiceEmails", () => ({ sendInvoiceEmail: vi.fn() }));
vi.mock("@/lib/invoices/invoicePublicToken", () => ({
  ensureInvoicePublicToken: vi.fn(),
  regenerateInvoicePublicToken: vi.fn(),
  InvoicePublicTokenAlreadyExistsError: class extends Error {},
}));
vi.mock("@/lib/subscriptions/setupLinkToken", () => ({ generateSetupLinkToken: vi.fn() }));

const mockPrisma = {
  orgEmailLog: { findFirst: vi.fn() },
  subscriptionSetupLink: { findFirst: vi.fn() },
  church: { findUnique: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

async function load() {
  vi.resetModules();
  return import("../resend/route");
}

function postReq(body?: unknown) {
  return new Request("http://x/api/merchant/email-logs/log-1/resend", {
    method: "POST",
    ...(body !== undefined ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } } : {}),
  });
}

const params = () => ({ params: Promise.resolve({ id: "log-1" }) });

beforeEach(() => vi.clearAllMocks());

describe("POST /api/merchant/email-logs/[id]/resend — additional recipients (cc)", () => {
  it("DONATION_RECEIPT: parses and passes additionalRecipients through to sendDonationReceipt", async () => {
    mockPrisma.orgEmailLog.findFirst.mockResolvedValue({
      id: "log-1",
      churchId: "church-1",
      category: "DONATION_RECEIPT",
      relatedEntityType: "Payment",
      relatedEntityId: "payment-1",
    });
    const { POST } = await load();
    const res = await POST(postReq({ additionalRecipients: "a@example.com, B@Example.com" }), params());
    expect(res.status).toBe(200);
    expect(mockSendDonationReceipt).toHaveBeenCalledWith("payment-1", "church-1", "user-1", ["a@example.com", "b@example.com"]);
  });

  it("EXTERNAL_DONATION_RECEIPT: same passthrough", async () => {
    mockPrisma.orgEmailLog.findFirst.mockResolvedValue({
      id: "log-1",
      churchId: "church-1",
      category: "EXTERNAL_DONATION_RECEIPT",
      relatedEntityType: "ExternalDonation",
      relatedEntityId: "ext-1",
    });
    const { POST } = await load();
    await POST(postReq({ additionalRecipients: ["c@example.com"] }), params());
    expect(mockSendExternalDonationReceiptEmail).toHaveBeenCalledWith("ext-1", "church-1", "user-1", ["c@example.com"]);
  });

  it("resends with an empty cc list when no body is sent — unchanged prior behavior", async () => {
    mockPrisma.orgEmailLog.findFirst.mockResolvedValue({
      id: "log-1",
      churchId: "church-1",
      category: "DONATION_RECEIPT",
      relatedEntityType: "Payment",
      relatedEntityId: "payment-1",
    });
    const { POST } = await load();
    const res = await POST(postReq(), params());
    expect(res.status).toBe(200);
    expect(mockSendDonationReceipt).toHaveBeenCalledWith("payment-1", "church-1", "user-1", []);
  });

  it("404s when the email log doesn't exist", async () => {
    mockPrisma.orgEmailLog.findFirst.mockResolvedValue(null);
    const { POST } = await load();
    const res = await POST(postReq(), params());
    expect(res.status).toBe(404);
  });
});
