import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => mockCookieStore) }));

const prismaMock = {
  adminImpersonationSession: { findUnique: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  dashboardAuditLog: { create: vi.fn().mockResolvedValue({}) },
};
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

async function loadModule() {
  vi.resetModules();
  const sessionModule = await import("@/lib/auth/session");
  const route = await import("@/app/api/admin/impersonate/exit/route");
  return { ...route, createSessionToken: sessionModule.createSessionToken };
}

function signImpersonationCookie(payload: { impersonationSessionId: string; adminUserId: string; targetChurchId: string }) {
  const crypto = require("crypto");
  const full = { ...payload, exp: Math.floor(Date.now() / 1000) + 3600 };
  const payloadB64 = Buffer.from(JSON.stringify(full)).toString("base64url");
  const signature = crypto.createHmac("sha256", process.env.AUTH_SESSION_SECRET).update(payloadB64).digest();
  return `${payloadB64}.${Buffer.from(signature).toString("base64url")}`;
}

describe("POST /api/admin/impersonate/exit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SESSION_SECRET = "test-secret-at-least-32-characters-long";
  });

  it("valid impersonation cookie: ends the session row, clears only the impersonation cookie, logs ADMIN_IMPERSONATION_ENDED, and never touches wgc_session", async () => {
    const { POST, createSessionToken } = await loadModule();
    const impToken = signImpersonationCookie({ impersonationSessionId: "imp-1", adminUserId: "admin-1", targetChurchId: "church-a" });
    const adminSession = createSessionToken({ userId: "admin-1", email: "admin-1@wgcpayments.com", role: "wgc_super_admin", churchId: null, authVersion: 1 });

    mockCookieStore.get.mockImplementation((name: string) => {
      if (name === "wgc_impersonation") return { value: impToken };
      if (name === "wgc_session") return { value: adminSession };
      return undefined;
    });
    prismaMock.adminImpersonationSession.findUnique.mockResolvedValue({
      id: "imp-1",
      adminUserId: "admin-1",
      adminEmail: "admin-1@wgcpayments.com",
      targetChurchId: "church-a",
      targetChurchName: "Church A",
      endedAt: null,
    });

    const res = await POST(new Request("http://x", { method: "POST" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.redirectTo).toBe("/admin/merchants/church-a");

    expect(prismaMock.adminImpersonationSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "imp-1", endedAt: null }, data: expect.objectContaining({ endedReason: "manual_exit" }) })
    );
    expect(mockCookieStore.delete).toHaveBeenCalledWith("wgc_impersonation");
    expect(mockCookieStore.delete).not.toHaveBeenCalledWith("wgc_session");
    expect(prismaMock.dashboardAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "ADMIN_IMPERSONATION_ENDED", churchId: "church-a" }) })
    );
  });

  it("no impersonation cookie present at all: idempotent 200, no error", async () => {
    const { POST } = await loadModule();
    mockCookieStore.get.mockReturnValue(undefined);

    const res = await POST(new Request("http://x", { method: "POST" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.redirectTo).toBe("/admin/merchants");
    expect(prismaMock.adminImpersonationSession.updateMany).not.toHaveBeenCalled();
  });
});
