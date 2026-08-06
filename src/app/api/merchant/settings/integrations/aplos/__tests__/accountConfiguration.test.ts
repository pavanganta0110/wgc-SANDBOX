import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => mockCookieStore) }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn() } } }));
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/integrations/aplos/accountConfigurationService", () => ({
  saveAccountConfiguration: vi.fn(),
  ConfigurationValidationError: class extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

process.env.AUTH_SESSION_SECRET = "test-secret-at-least-32-characters-long";

async function loadModule() {
  vi.resetModules();
  const sessionModule = await import("@/lib/auth/session");
  const route = await import("@/app/api/merchant/settings/integrations/aplos/account-configuration/route");
  return { ...route, createSessionToken: sessionModule.createSessionToken };
}
function sessionCookie(createSessionToken: (p: { userId: string; email: string; role: "owner" | "admin" | "fundraiser" | "viewer"; churchId: string; authVersion: number }) => string, role: "owner" | "admin" | "fundraiser" | "viewer", churchId = "church-a") {
  return createSessionToken({ userId: "user-1", email: "user@b.com", role, churchId, authVersion: 1 });
}
function mockUser(role: string, churchId = "church-a") {
  return { id: "user-1", email: "user@b.com", churchId, role, disabledAt: null, authVersion: 1, permissionsJson: null };
}

describe("PUT /api/merchant/settings/integrations/aplos/account-configuration", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires canManageIntegrations", async () => {
    const { PUT, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "fundraiser") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("fundraiser") as never);

    const res = await PUT(new Request("http://x", { method: "PUT", body: JSON.stringify({ depositAccountId: 1, processingFeeExpenseAccountId: 2, defaultPurposeId: 3 }) }));
    expect(res.status).toBe(403);
  });

  it("rejects non-numeric IDs", async () => {
    const { PUT, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner") as never);

    const res = await PUT(new Request("http://x", { method: "PUT", body: JSON.stringify({ depositAccountId: "not-a-number" }) }));
    expect(res.status).toBe(400);
  });

  it("returns 400 with a safe message on a revalidation failure, never a 500", async () => {
    const { PUT, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    const { saveAccountConfiguration, ConfigurationValidationError } = await import("@/lib/integrations/aplos/accountConfigurationService");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner") as never);
    vi.mocked(saveAccountConfiguration).mockRejectedValue(new ConfigurationValidationError("INVALID_DEPOSIT_ACCOUNT", "Account not eligible."));

    const res = await PUT(new Request("http://x", { method: "PUT", body: JSON.stringify({ depositAccountId: 1, processingFeeExpenseAccountId: 2, defaultPurposeId: 3 }) }));
    expect(res.status).toBe(400);
  });

  it("saves successfully and audits", async () => {
    const { PUT, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    const { saveAccountConfiguration } = await import("@/lib/integrations/aplos/accountConfigurationService");
    const { logDashboardAction } = await import("@/lib/dashboardAudit");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner", "church-xyz") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner", "church-xyz") as never);
    vi.mocked(saveAccountConfiguration).mockResolvedValue(undefined);

    const res = await PUT(new Request("http://x", { method: "PUT", body: JSON.stringify({ depositAccountId: 1000, processingFeeExpenseAccountId: 5000, defaultPurposeId: 1 }) }));
    expect(res.status).toBe(200);
    expect(vi.mocked(saveAccountConfiguration).mock.calls[0][0]).toBe("church-xyz");
    expect(logDashboardAction).toHaveBeenCalled();
  });
});
