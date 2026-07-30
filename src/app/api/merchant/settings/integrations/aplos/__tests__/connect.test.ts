import { describe, it, expect, vi, beforeEach } from "vitest";
import type { createSessionToken as CreateSessionTokenFn } from "@/lib/auth/session";

const mockCookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => mockCookieStore) }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn() } } }));
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/integrations/aplos/connectionService", () => ({
  connectOrganization: vi.fn(),
}));
vi.mock("@/lib/integrations/aplos/rateLimit", () => ({
  checkAplosConnectionRateLimit: vi.fn().mockReturnValue(true),
}));

async function loadModule() {
  vi.resetModules();
  const sessionModule = await import("@/lib/auth/session");
  const route = await import("@/app/api/merchant/settings/integrations/aplos/connect/route");
  return { ...route, createSessionToken: sessionModule.createSessionToken };
}

function sessionCookie(createSessionToken: typeof CreateSessionTokenFn, role: Parameters<typeof CreateSessionTokenFn>[0]["role"], churchId = "church-a") {
  return createSessionToken({ userId: "user-1", email: "user@b.com", role, churchId, authVersion: 1 });
}
function mockUser(role: string, churchId = "church-a") {
  return { id: "user-1", email: "user@b.com", churchId, role, disabledAt: null, authVersion: 1, permissionsJson: null };
}
function req(body: unknown) {
  return new Request("http://x/api/merchant/settings/integrations/aplos/connect", { method: "POST", body: JSON.stringify(body) });
}

describe("POST /api/merchant/settings/integrations/aplos/connect", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.AUTH_SESSION_SECRET = "test-secret-at-least-32-characters-long";
    // vi.clearAllMocks() clears call history but NOT a previously configured
    // mockReturnValue — without this, a prior test's
    // checkAplosConnectionRateLimit.mockReturnValue(false) silently leaks
    // into every later test in this file. Restore the safe default here.
    const { checkAplosConnectionRateLimit } = await import("@/lib/integrations/aplos/rateLimit");
    vi.mocked(checkAplosConnectionRateLimit).mockReturnValue(true);
  });

  it("requires authentication", async () => {
    const { POST } = await loadModule();
    mockCookieStore.get.mockReturnValue(undefined);
    const res = await POST(req({}));
    expect(res.status).toBe(401);
  });

  it("owner is allowed to connect", async () => {
    const { POST, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    const { connectOrganization } = await import("@/lib/integrations/aplos/connectionService");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner") as never);
    vi.mocked(connectOrganization).mockResolvedValue({ result: { success: true, aplosAccountId: "org-1" }, connected: true } as never);

    const res = await POST(req({ clientId: "c", privateKeyMaterial: "k", aplosAccountId: "org-1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("admin is allowed to connect", async () => {
    const { POST, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    const { connectOrganization } = await import("@/lib/integrations/aplos/connectionService");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "admin") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("admin") as never);
    vi.mocked(connectOrganization).mockResolvedValue({ result: { success: true, aplosAccountId: "org-1" }, connected: true } as never);

    const res = await POST(req({ clientId: "c", privateKeyMaterial: "k", aplosAccountId: "org-1" }));
    expect(res.status).toBe(200);
  });

  it("fundraiser is denied — canManageIntegrations is false by default", async () => {
    const { POST, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "fundraiser") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("fundraiser") as never);

    const res = await POST(req({ clientId: "c", privateKeyMaterial: "k", aplosAccountId: "org-1" }));
    expect(res.status).toBe(403);
  });

  it("viewer is denied", async () => {
    const { POST, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "viewer") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("viewer") as never);

    const res = await POST(req({ clientId: "c", privateKeyMaterial: "k", aplosAccountId: "org-1" }));
    expect(res.status).toBe(403);
  });

  it("never trusts a churchId in the request body — always uses the session's", async () => {
    const { POST, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    const { connectOrganization } = await import("@/lib/integrations/aplos/connectionService");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner", "real-church") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner", "real-church") as never);
    vi.mocked(connectOrganization).mockResolvedValue({ result: { success: true, aplosAccountId: "org-1" }, connected: true } as never);

    await POST(req({ churchId: "attacker-supplied-church", clientId: "c", privateKeyMaterial: "k", aplosAccountId: "org-1" }));
    expect(vi.mocked(connectOrganization).mock.calls[0][0]).toBe("real-church");
  });

  it("is rate-limited", async () => {
    const { POST, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    const { checkAplosConnectionRateLimit } = await import("@/lib/integrations/aplos/rateLimit");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner") as never);
    vi.mocked(checkAplosConnectionRateLimit).mockReturnValue(false);

    const res = await POST(req({ clientId: "c", privateKeyMaterial: "k", aplosAccountId: "org-1" }));
    expect(res.status).toBe(429);
  });

  it("truncates an oversized organizationLabel rather than storing it unbounded", async () => {
    const { POST, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    const { connectOrganization } = await import("@/lib/integrations/aplos/connectionService");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner") as never);
    vi.mocked(connectOrganization).mockResolvedValue({ result: { success: true, aplosAccountId: "org-1" }, connected: true } as never);

    await POST(req({ clientId: "c", privateKeyMaterial: "k", aplosAccountId: "org-1", organizationLabel: "x".repeat(500) }));
    const labelArg = vi.mocked(connectOrganization).mock.calls[0][2] as string;
    expect(labelArg.length).toBeLessThanOrEqual(100);
  });

  it("returns a safe error message and does not persist on verification failure", async () => {
    const { POST, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    const { connectOrganization } = await import("@/lib/integrations/aplos/connectionService");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner") as never);
    vi.mocked(connectOrganization).mockResolvedValue({
      result: { success: false, normalized: { category: "ACCESS_DENIED", retryable: false, safeMessage: "Access denied." } },
      connected: false,
    } as never);

    const res = await POST(req({ clientId: "c", privateKeyMaterial: "k", aplosAccountId: "org-1" }));
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Access denied.");
  });

  it("never logs or returns the submitted private key material", async () => {
    const { POST, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    const { connectOrganization } = await import("@/lib/integrations/aplos/connectionService");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner") as never);
    vi.mocked(connectOrganization).mockResolvedValue({ result: { success: true, aplosAccountId: "org-1" }, connected: true } as never);

    const res = await POST(req({ clientId: "c", privateKeyMaterial: "SECRET-KEY-CONTENT", aplosAccountId: "org-1" }));
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("SECRET-KEY-CONTENT");
  });
});
