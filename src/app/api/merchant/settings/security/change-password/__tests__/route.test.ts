import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => mockCookieStore),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/auth/password", () => ({
  hashPassword: vi.fn().mockResolvedValue("new-hash"),
  verifyPassword: vi.fn(),
}));

vi.mock("@/lib/dashboardAudit", () => ({
  logDashboardAction: vi.fn().mockResolvedValue(undefined),
}));

async function loadModule() {
  vi.resetModules();
  const sessionModule = await import("@/lib/auth/session");
  const route = await import("@/app/api/merchant/settings/security/change-password/route");
  return { ...route, createSessionToken: sessionModule.createSessionToken };
}

function sessionCookie(createSessionToken: any, role: string, userId: string) {
  return createSessionToken({ userId, email: `${userId}@b.com`, role, churchId: "church-a", authVersion: 1 });
}

function mockUser(userId: string, role: string, churchId = "church-a") {
  return { id: userId, email: `${userId}@b.com`, churchId, role, disabledAt: null, authVersion: 1, permissionsJson: null, passwordHash: "old-hash" };
}

describe("POST /api/merchant/settings/security/change-password — CP4C", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SESSION_SECRET = "test-secret-at-least-32-characters-long";
  });

  it("an authenticated fundraiser can change their own password", async () => {
    const { POST, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    const { verifyPassword } = await import("@/lib/auth/password");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "fundraiser", "fundraiser-1") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("fundraiser-1", "fundraiser") as never);
    vi.mocked(verifyPassword).mockResolvedValue(true as never);
    vi.mocked(prisma.user.update).mockResolvedValue({} as never);

    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ currentPassword: "old", newPassword: "newpassword123" }) }));
    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "fundraiser-1" }, data: { passwordHash: "new-hash" } });
  });

  it("wgc_admin is rejected by requireMerchantSession before any password logic runs", async () => {
    const { POST, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "wgc_admin", "admin-1") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("admin-1", "wgc_admin") as never);

    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ currentPassword: "old", newPassword: "newpassword123" }) }));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("a disabled user session is rejected", async () => {
    const { POST, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner", "owner-1") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...mockUser("owner-1", "owner"), disabledAt: new Date() } as never);

    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ currentPassword: "old", newPassword: "newpassword123" }) }));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("wrong current password is rejected without mutating the hash", async () => {
    const { POST, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    const { verifyPassword } = await import("@/lib/auth/password");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner", "owner-1") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner-1", "owner") as never);
    vi.mocked(verifyPassword).mockResolvedValue(false as never);

    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ currentPassword: "wrong", newPassword: "newpassword123" }) }));
    expect(res.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
