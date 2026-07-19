import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => mockCookieStore) }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));

async function loadModule() {
  vi.resetModules();
  const sessionModule = await import("@/lib/auth/session");
  const route = await import("@/app/api/merchant/view-scope/route");
  return { ...route, createSessionToken: sessionModule.createSessionToken };
}
function sessionCookie(createSessionToken: any, role: string, userId: string) {
  return createSessionToken({ userId, email: `${userId}@b.com`, role, churchId: "church-a", authVersion: 1 });
}
function mockUser(userId: string, role: string) {
  return { id: userId, email: `${userId}@b.com`, churchId: "church-a", role, disabledAt: null, authVersion: 1, permissionsJson: null };
}

describe("POST/DELETE /api/merchant/view-scope — dashboard scope dropdown (reporting scope only)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SESSION_SECRET = "test-secret-at-least-32-characters-long";
  });

  it("owner can set organization scope", async () => {
    const { POST, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner", "owner-1") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner-1", "owner") as never);

    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ kind: "organization" }) }));
    expect(res.status).toBe(200);
    expect(mockCookieStore.set).toHaveBeenCalled();
  });

  it("owner can set scope to a specific team member (view as)", async () => {
    const { POST, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner", "owner-1") });
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(mockUser("owner-1", "owner") as never)
      .mockResolvedValueOnce({ id: "fundraiser-1", churchId: "church-a" } as never);

    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ kind: "user", userId: "fundraiser-1" }) }));
    expect(res.status).toBe(200);
  });

  it("fundraiser cannot set organization scope (no canViewAllTransactions)", async () => {
    const { POST, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "fundraiser", "fundraiser-1") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("fundraiser-1", "fundraiser") as never);

    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ kind: "organization" }) }));
    expect(res.status).toBe(403);
    expect(mockCookieStore.set).not.toHaveBeenCalled();
  });

  it("fundraiser cannot view as another team member (no canViewAsUser)", async () => {
    const { POST, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "fundraiser", "fundraiser-1") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("fundraiser-1", "fundraiser") as never);

    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ kind: "user", userId: "someone-else" }) }));
    expect(res.status).toBe(403);
  });

  it("any authenticated role can set 'My Activity' (currentUser) scope", async () => {
    const { POST, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "fundraiser", "fundraiser-1") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("fundraiser-1", "fundraiser") as never);

    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ kind: "currentUser" }) }));
    expect(res.status).toBe(200);
  });

  it("cross-church target user is rejected", async () => {
    const { POST, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner", "owner-1") });
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(mockUser("owner-1", "owner") as never)
      .mockResolvedValueOnce({ id: "other-user", churchId: "church-b" } as never);

    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ kind: "user", userId: "other-user" }) }));
    expect(res.status).toBe(404);
  });

  it("wgc_admin is rejected outright", async () => {
    const { POST, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "wgc_admin", "admin-1") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("admin-1", "wgc_admin") as never);

    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ kind: "organization" }) }));
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("DELETE clears the scope cookie (return to organization view)", async () => {
    const { DELETE, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner", "owner-1") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner-1", "owner") as never);

    const res = await DELETE();
    expect(res.status).toBe(200);
    expect(mockCookieStore.delete).toHaveBeenCalled();
  });
});
