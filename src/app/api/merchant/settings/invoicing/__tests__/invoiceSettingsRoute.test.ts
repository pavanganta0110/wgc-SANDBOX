import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/lib/auth/requireMerchantSession", () => ({ requireMerchantSession: () => mockAuth() }));
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn().mockResolvedValue(undefined) }));

const mockPrisma = { invoiceSettings: { upsert: vi.fn(), findUnique: vi.fn() } };
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

function ownerAuth() {
  return { userId: "u1", email: "owner@a.com", churchId: "church-a", role: "owner", rawRole: "owner" };
}
function viewerAuth() {
  return { userId: "u2", email: "viewer@a.com", churchId: "church-a", role: "viewer", rawRole: "viewer" };
}
function putReq(body: unknown) {
  return new Request("http://x", { method: "PUT", body: JSON.stringify(body) });
}

async function loadRoute() {
  vi.resetModules();
  return import("@/app/api/merchant/settings/invoicing/route");
}

describe("PUT /api/merchant/settings/invoicing", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires canManageInvoiceSettings", async () => {
    const { PUT } = await loadRoute();
    mockAuth.mockResolvedValue(viewerAuth());
    const res = await PUT(putReq({ invoiceNumberPrefix: "INV-" }));
    expect(res.status).toBe(403);
  });

  it("rejects an unsafe prefix", async () => {
    const { PUT } = await loadRoute();
    mockAuth.mockResolvedValue(ownerAuth());
    const res = await PUT(putReq({ invoiceNumberPrefix: "<script>" }));
    expect(res.status).toBe(400);
  });

  it("rejects moving nextInvoiceSequence backward", async () => {
    const { PUT } = await loadRoute();
    mockAuth.mockResolvedValue(ownerAuth());
    mockPrisma.invoiceSettings.findUnique.mockResolvedValue({ nextInvoiceSequence: 50 });
    const res = await PUT(putReq({ invoiceNumberPrefix: "INV-", nextInvoiceSequence: 10 }));
    expect(res.status).toBe(400);
  });

  it("allows moving nextInvoiceSequence forward", async () => {
    const { PUT } = await loadRoute();
    mockAuth.mockResolvedValue(ownerAuth());
    mockPrisma.invoiceSettings.findUnique.mockResolvedValue({ nextInvoiceSequence: 5 });
    mockPrisma.invoiceSettings.upsert.mockResolvedValue({ nextInvoiceSequence: 100 });
    const res = await PUT(putReq({ invoiceNumberPrefix: "INV-", nextInvoiceSequence: 100 }));
    expect(res.status).toBe(200);
  });

  it("scopes the update to the caller's own church", async () => {
    const { PUT } = await loadRoute();
    mockAuth.mockResolvedValue(ownerAuth());
    mockPrisma.invoiceSettings.upsert.mockResolvedValue({});
    await PUT(putReq({ invoiceNumberPrefix: "INV-" }));
    expect(mockPrisma.invoiceSettings.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { churchId: "church-a" } }));
  });
});
