import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => mockCookieStore) }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn() }, aplosConnection: { findUnique: vi.fn(), update: vi.fn() } } }));
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/integrations/aplos/syncEligibility", () => ({ computeSyncEligibility: vi.fn() }));

process.env.AUTH_SESSION_SECRET = "test-secret-at-least-32-characters-long";

async function loadModule() {
  vi.resetModules();
  const sessionModule = await import("@/lib/auth/session");
  const route = await import("@/app/api/merchant/settings/integrations/aplos/sync-toggle/route");
  return { ...route, createSessionToken: sessionModule.createSessionToken };
}
function sessionCookie(createSessionToken: (p: { userId: string; email: string; role: "owner" | "admin" | "fundraiser" | "viewer"; churchId: string; authVersion: number }) => string, role: "owner" | "admin" | "fundraiser" | "viewer") {
  return createSessionToken({ userId: "user-1", email: "user@b.com", role, churchId: "church-a", authVersion: 1 });
}
function mockUser(role: string) {
  return { id: "user-1", email: "user@b.com", churchId: "church-a", role, disabledAt: null, authVersion: 1, permissionsJson: null };
}
function req(body: unknown) {
  return new Request("http://x", { method: "PUT", body: JSON.stringify(body) });
}

describe("PUT /api/merchant/settings/integrations/aplos/sync-toggle", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires canManageIntegrations", async () => {
    const { PUT, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "viewer") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("viewer") as never);

    const res = await PUT(req({ enabled: true }));
    expect(res.status).toBe(403);
  });

  it("blocks enabling when the eligibility check fails, and does not flip the flag", async () => {
    const { PUT, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    const { computeSyncEligibility } = await import("@/lib/integrations/aplos/syncEligibility");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner") as never);
    vi.mocked(computeSyncEligibility).mockResolvedValue({ eligible: false, reasons: ["not configured"] } as never);

    const res = await PUT(req({ enabled: true }));
    expect(res.status).toBe(400);
    expect(prisma.aplosConnection.update).not.toHaveBeenCalled();
  });

  it("allows enabling when eligible", async () => {
    const { PUT, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    const { computeSyncEligibility } = await import("@/lib/integrations/aplos/syncEligibility");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner") as never);
    vi.mocked(computeSyncEligibility).mockResolvedValue({ eligible: true, reasons: [] } as never);
    vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue({ churchId: "church-a" } as never);

    const res = await PUT(req({ enabled: true }));
    expect(res.status).toBe(200);
  });

  it("always allows disabling, without checking eligibility", async () => {
    const { PUT, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    const { computeSyncEligibility } = await import("@/lib/integrations/aplos/syncEligibility");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner") as never);
    vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue({ churchId: "church-a" } as never);

    const res = await PUT(req({ enabled: false }));
    expect(res.status).toBe(200);
    expect(computeSyncEligibility).not.toHaveBeenCalled();
  });

  it("404s when no connection exists", async () => {
    const { PUT, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner") as never);
    vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue(null);

    const res = await PUT(req({ enabled: false }));
    expect(res.status).toBe(404);
  });
});
