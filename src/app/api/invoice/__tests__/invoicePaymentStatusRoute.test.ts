import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCheckRateLimit = vi.fn(() => true);
vi.mock("@/lib/invoices/invoicePublicRateLimit", () => ({ checkInvoiceViewRateLimit: (key: string) => mockCheckRateLimit(key) }));

const mockResolveToken = vi.fn();
vi.mock("@/lib/invoices/invoicePublicToken", () => ({ resolveInvoicePublicToken: (token: string) => mockResolveToken(token) }));

const mockReconcile = vi.fn();
vi.mock("@/lib/invoices/invoicePaymentReconciliation", () => ({ reconcileInvoicePaymentAttempt: (id: string) => mockReconcile(id) }));

const mockPrisma = { invoice: { findUnique: vi.fn() } };
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

async function load() {
  vi.resetModules();
  return import("@/app/api/invoice/[token]/payment-status/route");
}

function req(url: string) {
  return new Request(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckRateLimit.mockReturnValue(true);
});

describe("GET /api/invoice/[token]/payment-status", () => {
  it("requires an attemptId query param", async () => {
    mockResolveToken.mockResolvedValue({ invoiceId: "inv1", churchId: "church-a" });
    const { GET } = await load();
    const res = await GET(req("http://x/api/invoice/tok/payment-status"), { params: Promise.resolve({ token: "tok" }) });
    expect(res.status).toBe(400);
  });

  it("rejects an invalid token", async () => {
    mockResolveToken.mockResolvedValue(null);
    const { GET } = await load();
    const res = await GET(req("http://x/api/invoice/tok/payment-status?attemptId=a1"), { params: Promise.resolve({ token: "tok" }) });
    expect(res.status).toBe(404);
  });

  it("returns 404 (no enumeration oracle) when the attempt belongs to a different invoice than the token resolves to", async () => {
    mockResolveToken.mockResolvedValue({ invoiceId: "inv1", churchId: "church-a" });
    mockReconcile.mockResolvedValue({ attempt: { invoiceId: "some-other-invoice", status: "PENDING", finixTransferId: "TR1", method: "ACH" }, payment: null });
    const { GET } = await load();
    const res = await GET(req("http://x/api/invoice/tok/payment-status?attemptId=a1"), { params: Promise.resolve({ token: "tok" }) });
    expect(res.status).toBe(404);
  });

  it("returns the reconciled state for a matching attempt", async () => {
    mockResolveToken.mockResolvedValue({ invoiceId: "inv1", churchId: "church-a" });
    mockReconcile.mockResolvedValue({
      attempt: { invoiceId: "inv1", status: "SUCCEEDED", finixTransferId: "TR1", method: "ACH", failureCode: null, failureMessage: null },
      payment: { grossAmountCents: 10000, feeContributionCents: 0, totalChargedCents: 10000, customerCoveredFee: false, status: "SUCCEEDED", updatedAt: new Date("2026-01-01") },
    });
    mockPrisma.invoice.findUnique.mockResolvedValue({ invoiceNumber: "INV-000001", status: "PAID", balanceCents: 0 });
    const { GET } = await load();
    const res = await GET(req("http://x/api/invoice/tok/payment-status?attemptId=a1"), { params: Promise.resolve({ token: "tok" }) });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.state).toBe("SUCCEEDED");
    expect(data.invoiceNumber).toBe("INV-000001");
    expect(data.amountCents).toBe(10000);
  });
});
