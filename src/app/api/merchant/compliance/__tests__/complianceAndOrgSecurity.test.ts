import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => mockCookieStore) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    complianceForm: { findFirst: vi.fn() },
    supportTicket: { create: vi.fn(), count: vi.fn().mockResolvedValue(0) },
    supportTicketMessage: { create: vi.fn() },
    church: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/support/ticketNotifications", () => ({
  notifyNewSupportTicket: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/finix/sync/complianceForms", () => ({
  reconcileComplianceFormsForChurch: vi.fn().mockResolvedValue(undefined),
  resolveComplianceStatus: vi.fn().mockReturnValue("PENDING"),
  upsertComplianceFormFromFinix: vi.fn(),
}));
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/finix/sync/syncFeeProfiles", () => ({ syncChurchPricingForChurch: vi.fn().mockResolvedValue({ updatedAt: new Date() }) }));

async function loadModule(path: string) {
  vi.resetModules();
  const sessionModule = await import("@/lib/auth/session");
  const route = await import(`@/app/api/merchant${path}/route`);
  return { ...route, createSessionToken: sessionModule.createSessionToken };
}
function sessionCookie(createSessionToken: any, role: string, userId: string) {
  return createSessionToken({ userId, email: `${userId}@b.com`, role, churchId: "church-a", authVersion: 1 });
}
function mockUser(userId: string, role: string) {
  return { id: userId, email: `${userId}@b.com`, churchId: "church-a", role, disabledAt: null, authVersion: 1, permissionsJson: null };
}

describe("CP4D: compliance / privacy-closure / org-change / pricing-sync permission gates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SESSION_SECRET = "test-secret-at-least-32-characters-long";
  });

  it("compliance read denied to fundraiser", async () => {
    const mod = await loadModule("/compliance");
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(mod.createSessionToken, "fundraiser", "fundraiser-1") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("fundraiser-1", "fundraiser") as never);

    const res = await mod.GET();
    expect(res.status).toBe(401);
  });

  it("compliance read denied to viewer", async () => {
    const mod = await loadModule("/compliance");
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(mod.createSessionToken, "viewer", "viewer-1") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("viewer-1", "viewer") as never);

    const res = await mod.GET();
    expect(res.status).toBe(401);
  });

  it("compliance read allowed for owner", async () => {
    const mod = await loadModule("/compliance");
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(mod.createSessionToken, "owner", "owner-1") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner-1", "owner") as never);
    vi.mocked(prisma.complianceForm.findFirst).mockResolvedValue(null as never);

    const res = await mod.GET();
    expect(res.status).toBe(200);
  });

  it("compliance attestation denied without canEdit (fundraiser)", async () => {
    const mod = await loadModule("/compliance/attest");
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(mod.createSessionToken, "fundraiser", "fundraiser-1") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("fundraiser-1", "fundraiser") as never);

    const res = await mod.POST(new Request("http://x", { method: "POST", body: JSON.stringify({ name: "A", title: "B", isAccepted: true }) }));
    expect(res.status).toBe(401);
    expect(prisma.complianceForm.findFirst).not.toHaveBeenCalled();
  });

  it("account-closure request is owner-only — admin denied", async () => {
    const mod = await loadModule("/settings/data-privacy/request-closure");
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(mod.createSessionToken, "admin", "admin-1") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("admin-1", "admin") as never);

    const res = await mod.POST(new Request("http://x", { method: "POST", body: JSON.stringify({}) }));
    expect(res.status).toBe(401);
    expect(prisma.supportTicket.create).not.toHaveBeenCalled();
  });

  it("account-closure request succeeds for owner", async () => {
    const mod = await loadModule("/settings/data-privacy/request-closure");
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(mod.createSessionToken, "owner", "owner-1") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner-1", "owner") as never);
    vi.mocked(prisma.supportTicket.create).mockResolvedValue({ id: "t1" } as never);

    const res = await mod.POST(new Request("http://x", { method: "POST", body: JSON.stringify({}) }));
    expect(res.status).toBe(200);
  });

  it("organization change request denied to fundraiser", async () => {
    const mod = await loadModule("/organization/request-change");
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(mod.createSessionToken, "fundraiser", "fundraiser-1") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("fundraiser-1", "fundraiser") as never);

    const res = await mod.POST(new Request("http://x", { method: "POST", body: JSON.stringify({ area: "LEGAL_NAME", details: "x" }) }));
    expect(res.status).toBe(401);
    expect(prisma.supportTicket.create).not.toHaveBeenCalled();
  });

  it("pricing sync denied to fundraiser (permission enforced, not just wgc_admin/church_admin string match)", async () => {
    const mod = await loadModule("/subscription/sync-pricing");
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(mod.createSessionToken, "fundraiser", "fundraiser-1") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("fundraiser-1", "fundraiser") as never);

    const res = await mod.POST(new Request("http://x", { method: "POST" }));
    expect(res.status).toBe(401);
    expect(prisma.church.findUnique).not.toHaveBeenCalled();
  });

  it("pricing sync denied to wgc_admin via a normal merchant route", async () => {
    const mod = await loadModule("/subscription/sync-pricing");
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(mod.createSessionToken, "wgc_admin", "admin-1") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("admin-1", "wgc_admin") as never);

    const res = await mod.POST(new Request("http://x", { method: "POST" }));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(prisma.church.findUnique).not.toHaveBeenCalled();
  });

  it("pricing sync succeeds for owner", async () => {
    const mod = await loadModule("/subscription/sync-pricing");
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(mod.createSessionToken, "owner", "owner-1") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner-1", "owner") as never);
    vi.mocked(prisma.church.findUnique).mockResolvedValue({ finixMerchantId: "MU1" } as never);

    const res = await mod.POST(new Request("http://x", { method: "POST" }));
    expect(res.status).toBe(200);
  });
});
