import { describe, it, expect, vi, beforeEach } from "vitest";
import type { createSessionToken as CreateSessionTokenFn } from "@/lib/auth/session";

const mockCookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => mockCookieStore) }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn() }, aplosConnection: { findUnique: vi.fn() } },
}));
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/integrations/aplos/connectionService", () => ({ disconnectConnection: vi.fn() }));

async function loadModule() {
  vi.resetModules();
  const sessionModule = await import("@/lib/auth/session");
  const route = await import("@/app/api/merchant/settings/integrations/aplos/disconnect/route");
  return { ...route, createSessionToken: sessionModule.createSessionToken };
}
function sessionCookie(createSessionToken: typeof CreateSessionTokenFn, role: Parameters<typeof CreateSessionTokenFn>[0]["role"], churchId = "church-a") {
  return createSessionToken({ userId: "user-1", email: "user@b.com", role, churchId, authVersion: 1 });
}
function mockUser(role: string, churchId = "church-a") {
  return { id: "user-1", email: "user@b.com", churchId, role, disabledAt: null, authVersion: 1, permissionsJson: null };
}
function req(body: unknown) {
  return new Request("http://x", { method: "POST", body: JSON.stringify(body) });
}

describe("POST /api/merchant/settings/integrations/aplos/disconnect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SESSION_SECRET = "test-secret-at-least-32-characters-long";
  });

  it("requires authentication", async () => {
    const { POST } = await loadModule();
    mockCookieStore.get.mockReturnValue(undefined);
    const res = await POST(req({ confirm: true }));
    expect(res.status).toBe(401);
  });

  it("fundraiser is denied", async () => {
    const { POST, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "fundraiser") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("fundraiser") as never);

    const res = await POST(req({ confirm: true }));
    expect(res.status).toBe(403);
  });

  it("requires explicit confirmation — a bare POST is rejected", async () => {
    const { POST, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner") as never);

    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it("404s when no connection exists", async () => {
    const { POST, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner") as never);
    vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue(null);

    const res = await POST(req({ confirm: true }));
    expect(res.status).toBe(404);
  });

  it("owner can disconnect an existing connection", async () => {
    const { POST, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    const { disconnectConnection } = await import("@/lib/integrations/aplos/connectionService");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner", "church-xyz") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner", "church-xyz") as never);
    vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue({ churchId: "church-xyz" } as never);

    const res = await POST(req({ confirm: true }));
    expect(res.status).toBe(200);
    expect(disconnectConnection).toHaveBeenCalledWith("church-xyz");
  });
});
