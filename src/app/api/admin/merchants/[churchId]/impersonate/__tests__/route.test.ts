import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => mockCookieStore) }));

const prismaMock = {
  user: { findUnique: vi.fn() },
  church: { findUnique: vi.fn() },
  adminImpersonationSession: { create: vi.fn() },
  dashboardAuditLog: { create: vi.fn().mockResolvedValue({}) },
};
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

async function loadModule() {
  vi.resetModules();
  const sessionModule = await import("@/lib/auth/session");
  const route = await import("@/app/api/admin/merchants/[churchId]/impersonate/route");
  return { ...route, createSessionToken: sessionModule.createSessionToken };
}

function adminSessionCookie(createSessionToken: any, role: "wgc_admin" | "wgc_super_admin", userId = "admin-1") {
  return createSessionToken({ userId, email: `${userId}@wgcpayments.com`, role, churchId: null, authVersion: 1 });
}
function adminUserRow(userId: string, role: "wgc_admin" | "wgc_super_admin", disabledAt: Date | null = null) {
  return { id: userId, email: `${userId}@wgcpayments.com`, name: "Admin", role, disabledAt, passwordChangedAt: null };
}

const params = (churchId: string) => ({ params: Promise.resolve({ churchId }) });

describe("POST /api/admin/merchants/[churchId]/impersonate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SESSION_SECRET = "test-secret-at-least-32-characters-long";
  });

  it("wgc_super_admin + active church starts a session, sets the cookie, and audit-logs the start", async () => {
    const { POST, createSessionToken } = await loadModule();
    mockCookieStore.get.mockReturnValue({ value: adminSessionCookie(createSessionToken, "wgc_super_admin") });
    prismaMock.user.findUnique.mockResolvedValue(adminUserRow("admin-1", "wgc_super_admin"));
    prismaMock.church.findUnique.mockResolvedValue({ id: "church-a", name: "Test Church", status: "ACTIVE" });
    prismaMock.adminImpersonationSession.create.mockResolvedValue({ id: "imp-1" });

    const res = await POST(new Request("http://x", { method: "POST" }), params("church-a"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.redirectTo).toBe("/merchant/dashboard");
    expect(mockCookieStore.set).toHaveBeenCalledWith(
      "wgc_impersonation",
      expect.any(String),
      expect.objectContaining({ httpOnly: true, sameSite: "lax" })
    );
    expect(prismaMock.dashboardAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "ADMIN_IMPERSONATION_STARTED", churchId: "church-a" }) })
    );
  });

  it("wgc_admin (not super) is forbidden — no cookie set", async () => {
    const { POST, createSessionToken } = await loadModule();
    mockCookieStore.get.mockReturnValue({ value: adminSessionCookie(createSessionToken, "wgc_admin") });
    prismaMock.user.findUnique.mockResolvedValue(adminUserRow("admin-1", "wgc_admin"));

    const res = await POST(new Request("http://x", { method: "POST" }), params("church-a"));
    expect(res.status).toBe(403);
    expect(mockCookieStore.set).not.toHaveBeenCalled();
    expect(prismaMock.adminImpersonationSession.create).not.toHaveBeenCalled();
  });

  it("no session at all is unauthorized", async () => {
    const { POST } = await loadModule();
    mockCookieStore.get.mockReturnValue(undefined);

    const res = await POST(new Request("http://x", { method: "POST" }), params("church-a"));
    expect(res.status).toBe(401);
  });

  it("nonexistent church returns 404", async () => {
    const { POST, createSessionToken } = await loadModule();
    mockCookieStore.get.mockReturnValue({ value: adminSessionCookie(createSessionToken, "wgc_super_admin") });
    prismaMock.user.findUnique.mockResolvedValue(adminUserRow("admin-1", "wgc_super_admin"));
    prismaMock.church.findUnique.mockResolvedValue(null);

    const res = await POST(new Request("http://x", { method: "POST" }), params("no-such-church"));
    expect(res.status).toBe(404);
    expect(mockCookieStore.set).not.toHaveBeenCalled();
  });

  it("disabled/suspended church returns 409, no cookie set", async () => {
    const { POST, createSessionToken } = await loadModule();
    mockCookieStore.get.mockReturnValue({ value: adminSessionCookie(createSessionToken, "wgc_super_admin") });
    prismaMock.user.findUnique.mockResolvedValue(adminUserRow("admin-1", "wgc_super_admin"));
    prismaMock.church.findUnique.mockResolvedValue({ id: "church-a", name: "Test Church", status: "SUSPENDED" });

    const res = await POST(new Request("http://x", { method: "POST" }), params("church-a"));
    expect(res.status).toBe(409);
    expect(mockCookieStore.set).not.toHaveBeenCalled();
  });

  it("churchId is read only from the URL param — a body-supplied churchId is never consulted", async () => {
    const { POST, createSessionToken } = await loadModule();
    mockCookieStore.get.mockReturnValue({ value: adminSessionCookie(createSessionToken, "wgc_super_admin") });
    prismaMock.user.findUnique.mockResolvedValue(adminUserRow("admin-1", "wgc_super_admin"));
    prismaMock.church.findUnique.mockResolvedValue({ id: "church-a", name: "Test Church", status: "ACTIVE" });
    prismaMock.adminImpersonationSession.create.mockResolvedValue({ id: "imp-1" });

    await POST(
      new Request("http://x", { method: "POST", body: JSON.stringify({ churchId: "church-EVIL" }) }),
      params("church-a")
    );
    expect(prismaMock.church.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "church-a" } }));
  });
});
