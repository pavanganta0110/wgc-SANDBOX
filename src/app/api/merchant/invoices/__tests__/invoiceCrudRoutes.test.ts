import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/lib/auth/requireMerchantSession", () => ({ requireMerchantSession: () => mockAuth() }));
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn().mockResolvedValue(undefined) }));

const mockPrisma = {
  client: { findFirst: vi.fn() },
  invoice: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  invoiceLineItem: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
  invoicePayment: { count: vi.fn() },
  invoicePublicToken: { updateMany: vi.fn() },
  invoiceSettings: { upsert: vi.fn() },
  $transaction: vi.fn(),
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

function ownerAuth(churchId = "church-a") {
  return { userId: "u1", email: "owner@a.com", churchId, role: "owner", rawRole: "owner" };
}
function fundraiserAuth(churchId = "church-a", userId = "u2") {
  return { userId, email: "f@a.com", churchId, role: "fundraiser", rawRole: "fundraiser" };
}
function viewerAuth(churchId = "church-a") {
  return { userId: "u3", email: "viewer@a.com", churchId, role: "viewer", rawRole: "viewer" };
}

function req(body: unknown) {
  return new Request("http://x", { method: "POST", body: JSON.stringify(body) });
}

async function loadCreate() {
  vi.resetModules();
  return import("@/app/api/merchant/invoices/create/route");
}
async function loadUpdate() {
  vi.resetModules();
  return import("@/app/api/merchant/invoices/[invoiceId]/update/route");
}
async function loadVoid() {
  vi.resetModules();
  return import("@/app/api/merchant/invoices/[invoiceId]/void/route");
}
async function loadMarkUncollectible() {
  vi.resetModules();
  return import("@/app/api/merchant/invoices/[invoiceId]/mark-uncollectible/route");
}
async function loadDuplicate() {
  vi.resetModules();
  return import("@/app/api/merchant/invoices/[invoiceId]/duplicate/route");
}

const VALID_LINE_ITEMS = [{ description: "Consulting", quantity: 2, unitPriceCents: 5000 }];

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(async (fnOrArray: unknown) => {
    if (typeof fnOrArray === "function") {
      return (fnOrArray as (tx: typeof mockPrisma) => unknown)({
        invoice: mockPrisma.invoice,
        invoiceLineItem: mockPrisma.invoiceLineItem,
        invoicePublicToken: mockPrisma.invoicePublicToken,
      } as unknown as typeof mockPrisma);
    }
    return Promise.all(fnOrArray as Promise<unknown>[]);
  });
  mockPrisma.invoiceSettings.upsert.mockResolvedValue({ nextInvoiceSequence: 2, invoiceNumberPrefix: "INV-" });
});

describe("POST /api/merchant/invoices/create", () => {
  it("requires canCreateInvoices", async () => {
    const { POST } = await loadCreate();
    mockAuth.mockResolvedValue(viewerAuth());
    const res = await POST(req({ clientId: "c1", dueDate: "2026-12-01", lineItems: VALID_LINE_ITEMS }));
    expect(res.status).toBe(403);
  });

  it("requires a client that belongs to the caller's own church", async () => {
    const { POST } = await loadCreate();
    mockAuth.mockResolvedValue(ownerAuth("church-a"));
    mockPrisma.client.findFirst.mockResolvedValue(null);
    const res = await POST(req({ clientId: "c-other", dueDate: "2026-12-01", lineItems: VALID_LINE_ITEMS }));
    expect(res.status).toBe(400);
    expect(mockPrisma.client.findFirst).toHaveBeenCalledWith({ where: { id: "c-other", churchId: "church-a" } });
  });

  it("requires at least one line item", async () => {
    const { POST } = await loadCreate();
    mockAuth.mockResolvedValue(ownerAuth());
    mockPrisma.client.findFirst.mockResolvedValue({ id: "c1" });
    const res = await POST(req({ clientId: "c1", dueDate: "2026-12-01", lineItems: [] }));
    expect(res.status).toBe(400);
  });

  it("requires a valid due date", async () => {
    const { POST } = await loadCreate();
    mockAuth.mockResolvedValue(ownerAuth());
    mockPrisma.client.findFirst.mockResolvedValue({ id: "c1" });
    const res = await POST(req({ clientId: "c1", dueDate: "not-a-date", lineItems: VALID_LINE_ITEMS }));
    expect(res.status).toBe(400);
  });

  it("creates a DRAFT invoice with server-computed totals", async () => {
    const { POST } = await loadCreate();
    mockAuth.mockResolvedValue(ownerAuth("church-a"));
    mockPrisma.client.findFirst.mockResolvedValue({ id: "c1" });
    mockPrisma.invoice.create.mockResolvedValue({ id: "inv-1", invoiceNumber: "INV-000001" });
    mockPrisma.invoiceLineItem.createMany.mockResolvedValue({ count: 1 });
    const res = await POST(req({ clientId: "c1", dueDate: "2026-12-01", lineItems: VALID_LINE_ITEMS }));
    expect(res.status).toBe(200);
    const createCall = mockPrisma.invoice.create.mock.calls[0][0];
    expect(createCall.data.status).toBe("DRAFT");
    expect(createCall.data.totalCents).toBe(10000);
    expect(createCall.data.churchId).toBe("church-a");
  });

  it("scopes new line items to the newly created invoice", async () => {
    const { POST } = await loadCreate();
    mockAuth.mockResolvedValue(ownerAuth("church-a"));
    mockPrisma.client.findFirst.mockResolvedValue({ id: "c1" });
    mockPrisma.invoice.create.mockResolvedValue({ id: "inv-new" });
    await POST(req({ clientId: "c1", dueDate: "2026-12-01", lineItems: VALID_LINE_ITEMS }));
    const createManyCall = mockPrisma.invoiceLineItem.createMany.mock.calls[0][0];
    expect(createManyCall.data[0].invoiceId).toBe("inv-new");
  });
});

describe("POST /api/merchant/invoices/[invoiceId]/update", () => {
  it("returns 404 for an invoice belonging to a different church", async () => {
    const { POST } = await loadUpdate();
    mockAuth.mockResolvedValue(ownerAuth("church-a"));
    mockPrisma.invoice.findFirst.mockResolvedValue(null);
    const res = await POST(req({ lineItems: VALID_LINE_ITEMS, dueDate: "2026-12-01" }), { params: Promise.resolve({ invoiceId: "inv-1" }) });
    expect(res.status).toBe(404);
  });

  it("blocks editing once the invoice has a successful payment", async () => {
    const { POST } = await loadUpdate();
    mockAuth.mockResolvedValue(ownerAuth());
    mockPrisma.invoice.findFirst.mockResolvedValue({ id: "inv-1", status: "PARTIALLY_PAID", dueDate: new Date(), issueDate: new Date(), createdByUserId: "u1" });
    mockPrisma.invoicePayment.count.mockResolvedValue(1);
    const res = await POST(req({ lineItems: VALID_LINE_ITEMS, dueDate: "2026-12-01" }), { params: Promise.resolve({ invoiceId: "inv-1" }) });
    expect(res.status).toBe(409);
  });

  it("blocks a VOID invoice from being edited even with zero payments", async () => {
    const { POST } = await loadUpdate();
    mockAuth.mockResolvedValue(ownerAuth());
    mockPrisma.invoice.findFirst.mockResolvedValue({ id: "inv-1", status: "VOID", dueDate: new Date(), issueDate: new Date(), createdByUserId: "u1" });
    mockPrisma.invoicePayment.count.mockResolvedValue(0);
    const res = await POST(req({ lineItems: VALID_LINE_ITEMS, dueDate: "2026-12-01" }), { params: Promise.resolve({ invoiceId: "inv-1" }) });
    expect(res.status).toBe(409);
  });

  it("blocks a fundraiser from editing an invoice they didn't create", async () => {
    const { POST } = await loadUpdate();
    mockAuth.mockResolvedValue(fundraiserAuth("church-a", "u2"));
    mockPrisma.invoice.findFirst.mockResolvedValue({ id: "inv-1", status: "DRAFT", dueDate: new Date(), issueDate: new Date(), createdByUserId: "someone-else" });
    const res = await POST(req({ lineItems: VALID_LINE_ITEMS, dueDate: "2026-12-01" }), { params: Promise.resolve({ invoiceId: "inv-1" }) });
    expect(res.status).toBe(403);
  });

  it("allows a fundraiser to edit their own draft", async () => {
    const { POST } = await loadUpdate();
    mockAuth.mockResolvedValue(fundraiserAuth("church-a", "u2"));
    mockPrisma.invoice.findFirst.mockResolvedValue({ id: "inv-1", status: "DRAFT", dueDate: new Date(), issueDate: new Date(), createdByUserId: "u2", clientId: "c1", classification: "GOODS_OR_SERVICES", templateName: "CLASSIC" });
    mockPrisma.invoicePayment.count.mockResolvedValue(0);
    mockPrisma.invoice.update.mockResolvedValue({ id: "inv-1" });
    const res = await POST(req({ lineItems: VALID_LINE_ITEMS, dueDate: "2026-12-01" }), { params: Promise.resolve({ invoiceId: "inv-1" }) });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/merchant/invoices/[invoiceId]/void", () => {
  it("voids a SENT invoice and revokes its active public token", async () => {
    const { POST } = await loadVoid();
    mockAuth.mockResolvedValue(ownerAuth());
    mockPrisma.invoice.findFirst.mockResolvedValue({ id: "inv-1", status: "SENT" });
    const res = await POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ invoiceId: "inv-1" }) });
    expect(res.status).toBe(200);
    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });

  it("rejects voiding an already-PAID invoice", async () => {
    const { POST } = await loadVoid();
    mockAuth.mockResolvedValue(ownerAuth());
    mockPrisma.invoice.findFirst.mockResolvedValue({ id: "inv-1", status: "PAID" });
    const res = await POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ invoiceId: "inv-1" }) });
    expect(res.status).toBe(409);
  });

  it("requires canVoidInvoices", async () => {
    const { POST } = await loadVoid();
    mockAuth.mockResolvedValue(viewerAuth());
    const res = await POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ invoiceId: "inv-1" }) });
    expect(res.status).toBe(403);
  });
});

describe("POST /api/merchant/invoices/[invoiceId]/mark-uncollectible", () => {
  it("marks a PAST_DUE invoice uncollectible", async () => {
    const { POST } = await loadMarkUncollectible();
    mockAuth.mockResolvedValue(ownerAuth());
    mockPrisma.invoice.findFirst.mockResolvedValue({ id: "inv-1", status: "PAST_DUE" });
    mockPrisma.invoice.update.mockResolvedValue({});
    const res = await POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ invoiceId: "inv-1" }) });
    expect(res.status).toBe(200);
  });

  it("rejects marking a DRAFT invoice uncollectible", async () => {
    const { POST } = await loadMarkUncollectible();
    mockAuth.mockResolvedValue(ownerAuth());
    mockPrisma.invoice.findFirst.mockResolvedValue({ id: "inv-1", status: "DRAFT" });
    const res = await POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ invoiceId: "inv-1" }) });
    expect(res.status).toBe(409);
  });
});

describe("POST /api/merchant/invoices/[invoiceId]/duplicate", () => {
  it("creates a new DRAFT invoice with a fresh invoice number", async () => {
    const { POST } = await loadDuplicate();
    mockAuth.mockResolvedValue(ownerAuth("church-a"));
    mockPrisma.invoice.findFirst.mockResolvedValue({
      id: "inv-1", clientId: "c1", classification: "GOODS_OR_SERVICES", goodsServicesValueCents: null, charitablePortionCents: null,
      linkedDonorId: null, noGoodsOrServicesConfirmed: false, title: "Original", internalNotes: null, clientMemo: null,
      paymentInstructions: null, termsAndConditions: null, issueDate: new Date("2026-01-01"), dueDate: new Date("2026-01-31"),
      subtotalCents: 10000, discountCents: 0, taxCents: 0, serviceFeeCents: 0, totalCents: 10000,
      allowCard: true, allowAch: true, allowApplePay: true, allowGooglePay: true, allowPartialPayments: false,
      minimumPartialPaymentCents: null, feeCoveredBy: "MERCHANT", autoCloseWhenPaid: true, templateName: "CLASSIC", accentColor: null,
    });
    mockPrisma.invoiceLineItem.findMany.mockResolvedValue([]);
    mockPrisma.invoiceSettings.upsert.mockResolvedValue({ nextInvoiceSequence: 2, invoiceNumberPrefix: "INV-" });
    mockPrisma.invoice.create.mockResolvedValue({ id: "inv-2", invoiceNumber: "INV-000001" });
    const res = await POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ invoiceId: "inv-1" }) });
    expect(res.status).toBe(200);
    const createCall = mockPrisma.invoice.create.mock.calls[0][0];
    expect(createCall.data.status).toBe("DRAFT");
    expect(createCall.data.invoiceNumber).toBe("INV-000001");
  });
});
