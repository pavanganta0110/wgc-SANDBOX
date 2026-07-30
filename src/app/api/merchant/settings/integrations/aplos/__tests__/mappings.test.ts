import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => mockCookieStore) }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn() } } }));
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/integrations/aplos/mappingService", () => ({ saveFundMapping: vi.fn(), removeFundMapping: vi.fn(), MappingValidationError: class extends Error { code = "FUND_NOT_FOUND"; } }));

process.env.AUTH_SESSION_SECRET = "test-secret-at-least-32-characters-long";

async function loadModule() {
  vi.resetModules();
  const sessionModule = await import("@/lib/auth/session");
  const route = await import("@/app/api/merchant/settings/integrations/aplos/mappings/route");
  return { ...route, createSessionToken: sessionModule.createSessionToken };
}
function sessionCookie(createSessionToken: (p: { userId: string; email: string; role: "owner" | "admin" | "fundraiser" | "viewer"; churchId: string; authVersion: number }) => string, role: "owner" | "admin" | "fundraiser" | "viewer", churchId = "church-a") {
  return createSessionToken({ userId: "user-1", email: "user@b.com", role, churchId, authVersion: 1 });
}
function mockUser(role: string, churchId = "church-a") {
  return { id: "user-1", email: "user@b.com", churchId, role, disabledAt: null, authVersion: 1, permissionsJson: null };
}
function req(method: string, body: unknown) {
  return new Request("http://x", { method, body: JSON.stringify(body) });
}

describe("PUT /api/merchant/settings/integrations/aplos/mappings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires canManageIntegrations", async () => {
    const { PUT, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "fundraiser") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("fundraiser") as never);

    const res = await PUT(req("PUT", { wgcFundId: "f1", aplosPurposeId: 1 }));
    expect(res.status).toBe(403);
  });

  it("validates required fields", async () => {
    const { PUT, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner") as never);

    const res = await PUT(req("PUT", {}));
    expect(res.status).toBe(400);
  });

  it("saves a valid mapping and audits it", async () => {
    const { PUT, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    const { saveFundMapping } = await import("@/lib/integrations/aplos/mappingService");
    const { logDashboardAction } = await import("@/lib/dashboardAudit");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner", "church-xyz") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner", "church-xyz") as never);
    vi.mocked(saveFundMapping).mockResolvedValue(undefined);

    const res = await PUT(req("PUT", { wgcFundId: "f1", aplosPurposeId: 42 }));
    expect(res.status).toBe(200);
    expect(vi.mocked(saveFundMapping).mock.calls[0][0]).toBe("church-xyz"); // never trusts a body-supplied churchId
    expect(logDashboardAction).toHaveBeenCalled();
  });
});

describe("DELETE /api/merchant/settings/integrations/aplos/mappings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires canManageIntegrations", async () => {
    const { DELETE, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "viewer") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("viewer") as never);

    const res = await DELETE(req("DELETE", { wgcFundId: "f1" }));
    expect(res.status).toBe(403);
  });

  it("removes a mapping scoped to the session's church", async () => {
    const { DELETE, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    const { removeFundMapping } = await import("@/lib/integrations/aplos/mappingService");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "admin", "church-xyz") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("admin", "church-xyz") as never);

    const res = await DELETE(req("DELETE", { wgcFundId: "f1" }));
    expect(res.status).toBe(200);
    expect(removeFundMapping).toHaveBeenCalledWith("church-xyz", "f1");
  });
});
