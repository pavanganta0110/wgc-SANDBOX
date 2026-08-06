import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A fundraiser's canSendInvoices/canViewInvoices/canCreateInvoices grants
 * are scoped to invoices they created (see roles.ts's doc comment on the
 * fundraiser role) — but that scoping has to be enforced per-route by
 * checking invoice.createdByUserId, since requirePermission only checks
 * the flat permission flag. These tests cover the routes that flag alone
 * would otherwise leave open: a fundraiser sending, generating/regenerating
 * a payment link for, or downloading the PDF of another team member's
 * invoice.
 */

const mockAuth = vi.fn();
vi.mock("@/lib/auth/requireMerchantSession", () => ({ requireMerchantSession: () => mockAuth() }));
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/invoices/invoiceSendValidation", () => ({ validateInvoiceForSend: vi.fn() }));
vi.mock("@/lib/invoices/invoicePublicToken", () => ({
  ensureInvoicePublicToken: vi.fn(),
  regenerateInvoicePublicToken: vi.fn(),
  InvoicePublicTokenAlreadyExistsError: class extends Error {},
}));
vi.mock("@/lib/invoices/invoiceEmails", () => ({ sendInvoiceEmail: vi.fn() }));
vi.mock("@/lib/invoices/generateInvoicePdf", () => ({ generateInvoicePdf: vi.fn().mockResolvedValue(Buffer.from("pdf")) }));

const mockPrisma = {
  invoice: { findFirst: vi.fn(), update: vi.fn() },
  invoiceActivity: { create: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

function fundraiserAuth(userId = "u2") {
  return { userId, email: "f@a.com", churchId: "church-a", role: "fundraiser", rawRole: "fundraiser" };
}

function baseInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: "inv-1",
    churchId: "church-a",
    createdByUserId: "someone-else",
    status: "DRAFT",
    dueDate: new Date("2026-01-31"),
    issueDate: new Date("2026-01-01"),
    firstViewedAt: null,
    sentAt: null,
    balanceCents: 10000,
    totalCents: 10000,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/merchant/invoices/[invoiceId]/send", () => {
  it("blocks a fundraiser from sending an invoice they didn't create", async () => {
    vi.resetModules();
    const { POST } = await import("@/app/api/merchant/invoices/[invoiceId]/send/route");
    mockAuth.mockResolvedValue(fundraiserAuth());
    mockPrisma.invoice.findFirst.mockResolvedValue(baseInvoice());
    const res = await POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ invoiceId: "inv-1" }) });
    expect(res.status).toBe(403);
    expect(mockPrisma.invoice.update).not.toHaveBeenCalled();
  });
});

describe("POST /api/merchant/invoices/[invoiceId]/link", () => {
  it("blocks a fundraiser from generating a payment link for an invoice they didn't create", async () => {
    vi.resetModules();
    const { POST } = await import("@/app/api/merchant/invoices/[invoiceId]/link/route");
    mockAuth.mockResolvedValue(fundraiserAuth());
    mockPrisma.invoice.findFirst.mockResolvedValue(baseInvoice({ status: "SENT" }));
    const res = await POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ invoiceId: "inv-1" }) });
    expect(res.status).toBe(403);
  });
});

describe("POST /api/merchant/invoices/[invoiceId]/link/regenerate", () => {
  it("blocks a fundraiser from regenerating the payment link for an invoice they didn't create", async () => {
    vi.resetModules();
    const { POST } = await import("@/app/api/merchant/invoices/[invoiceId]/link/regenerate/route");
    mockAuth.mockResolvedValue(fundraiserAuth());
    mockPrisma.invoice.findFirst.mockResolvedValue(baseInvoice({ status: "SENT" }));
    const res = await POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ invoiceId: "inv-1" }) });
    expect(res.status).toBe(403);
  });
});

describe("GET /api/merchant/invoices/[invoiceId]/pdf", () => {
  it("blocks a fundraiser from downloading the PDF of an invoice they didn't create", async () => {
    vi.resetModules();
    const { GET } = await import("@/app/api/merchant/invoices/[invoiceId]/pdf/route");
    mockAuth.mockResolvedValue(fundraiserAuth());
    mockPrisma.invoice.findFirst.mockResolvedValue(baseInvoice());
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ invoiceId: "inv-1" }) });
    expect(res.status).toBe(403);
  });

  it("allows a fundraiser to download the PDF of their own invoice", async () => {
    vi.resetModules();
    const { GET } = await import("@/app/api/merchant/invoices/[invoiceId]/pdf/route");
    mockAuth.mockResolvedValue(fundraiserAuth("u2"));
    mockPrisma.invoice.findFirst.mockResolvedValue(baseInvoice({ createdByUserId: "u2" }));
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ invoiceId: "inv-1" }) });
    expect(res.status).toBe(200);
  });
});
