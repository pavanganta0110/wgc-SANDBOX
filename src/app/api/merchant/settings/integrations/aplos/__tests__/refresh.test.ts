import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => mockCookieStore) }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn() }, aplosConnection: { updateMany: vi.fn() } } }));
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/integrations/aplos/accountConfigurationService", () => ({ revalidateSavedConfiguration: vi.fn() }));

process.env.AUTH_SESSION_SECRET = "test-secret-at-least-32-characters-long";

async function loadModule() {
  vi.resetModules();
  const sessionModule = await import("@/lib/auth/session");
  const route = await import("@/app/api/merchant/settings/integrations/aplos/refresh/route");
  return { ...route, createSessionToken: sessionModule.createSessionToken };
}
function sessionCookie(createSessionToken: (p: { userId: string; email: string; role: "owner" | "admin" | "fundraiser" | "viewer"; churchId: string; authVersion: number }) => string, role: "owner" | "admin" | "fundraiser" | "viewer") {
  return createSessionToken({ userId: "user-1", email: "user@b.com", role, churchId: "church-a", authVersion: 1 });
}
function mockUser(role: string) {
  return { id: "user-1", email: "user@b.com", churchId: "church-a", role, disabledAt: null, authVersion: 1, permissionsJson: null };
}
function req() {
  return new Request("http://x", { method: "POST" });
}

describe("POST /api/merchant/settings/integrations/aplos/refresh", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires canManageIntegrations", async () => {
    const { POST, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "fundraiser") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("fundraiser") as never);

    expect((await POST(req())).status).toBe(403);
  });

  it("404s when no configuration has been saved", async () => {
    const { POST, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    const { revalidateSavedConfiguration } = await import("@/lib/integrations/aplos/accountConfigurationService");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner") as never);
    vi.mocked(revalidateSavedConfiguration).mockResolvedValue(null);

    expect((await POST(req())).status).toBe(404);
  });

  it("disables automatic sync and audits when a resource is now invalid", async () => {
    const { POST, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    const { revalidateSavedConfiguration } = await import("@/lib/integrations/aplos/accountConfigurationService");
    const { logDashboardAction } = await import("@/lib/dashboardAudit");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner") as never);
    vi.mocked(revalidateSavedConfiguration).mockResolvedValue({
      depositAccountValid: true,
      processingFeeExpenseAccountValid: false,
      defaultPurposeValid: true,
      errors: ["Expense account removed."],
    } as never);

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(prisma.aplosConnection.updateMany).toHaveBeenCalled();
    expect(logDashboardAction).toHaveBeenCalled();
  });

  it("does not disable sync or audit when everything is still valid", async () => {
    const { POST, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    const { revalidateSavedConfiguration } = await import("@/lib/integrations/aplos/accountConfigurationService");
    const { logDashboardAction } = await import("@/lib/dashboardAudit");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner") as never);
    vi.mocked(revalidateSavedConfiguration).mockResolvedValue({
      depositAccountValid: true,
      processingFeeExpenseAccountValid: true,
      defaultPurposeValid: true,
      errors: [],
    } as never);

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(prisma.aplosConnection.updateMany).not.toHaveBeenCalled();
    expect(logDashboardAction).not.toHaveBeenCalled();
  });
});
