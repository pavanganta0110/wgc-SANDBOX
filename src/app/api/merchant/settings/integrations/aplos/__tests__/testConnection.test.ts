import { describe, it, expect, vi, beforeEach } from "vitest";
import type { createSessionToken as CreateSessionTokenFn } from "@/lib/auth/session";
import crypto from "crypto";

// A real RSA key — used wherever a mocked service returns "the decrypted
// private key material," because validateCredentialInput() is NOT mocked
// in this file (it's a real, direct import inside the route) and will
// genuinely reject a placeholder string like "k" as an invalid key format.
const { privateKey: REAL_TEST_PRIVATE_KEY } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const mockCookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => mockCookieStore) }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn() }, aplosConnection: { findUnique: vi.fn(), update: vi.fn() } },
}));
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/integrations/aplos/connectionService", () => ({
  testConnection: vi.fn(),
  decryptStoredCredential: vi.fn(),
  runAplosVerification: vi.fn(),
}));
vi.mock("@/lib/integrations/aplos/rateLimit", () => ({ checkAplosConnectionRateLimit: vi.fn().mockReturnValue(true) }));

async function loadModule() {
  vi.resetModules();
  const sessionModule = await import("@/lib/auth/session");
  const route = await import("@/app/api/merchant/settings/integrations/aplos/test-connection/route");
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

describe("POST /api/merchant/settings/integrations/aplos/test-connection", () => {
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
    const res = await POST(req({ clientId: "c", privateKeyMaterial: "k", aplosAccountId: "o" }));
    expect(res.status).toBe(401);
  });

  it("viewer is denied — Test Connection requires canManageIntegrations", async () => {
    const { POST, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "viewer") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("viewer") as never);

    const res = await POST(req({ clientId: "c", privateKeyMaterial: "k", aplosAccountId: "o" }));
    expect(res.status).toBe(403);
  });

  it("tests ephemeral submitted credentials without requiring an existing connection", async () => {
    const { POST, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    const { testConnection } = await import("@/lib/integrations/aplos/connectionService");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner") as never);
    vi.mocked(testConnection).mockResolvedValue({ success: true, aplosAccountId: "org-1" } as never);

    const res = await POST(req({ clientId: "c", privateKeyMaterial: "k", aplosAccountId: "org-1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("re-tests the stored connection when no credentials are submitted", async () => {
    const { POST, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    const { decryptStoredCredential, runAplosVerification } = await import("@/lib/integrations/aplos/connectionService");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner") as never);
    vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue({ status: "CONNECTED", clientId: "c", aplosOrganizationId: "org-1" } as never);
    vi.mocked(decryptStoredCredential).mockResolvedValue({ clientId: "c", privateKeyMaterial: REAL_TEST_PRIVATE_KEY } as never);
    vi.mocked(runAplosVerification).mockResolvedValue({ success: true, aplosAccountId: "org-1" } as never);

    const res = await POST(req({}));
    expect(res.status).toBe(200);
    expect(decryptStoredCredential).toHaveBeenCalledWith("church-a");
  });

  it("returns 400 when re-testing with no submitted credentials and no existing connected row", async () => {
    const { POST, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner") as never);
    vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue(null);

    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it("is rate-limited", async () => {
    const { POST, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    const { checkAplosConnectionRateLimit } = await import("@/lib/integrations/aplos/rateLimit");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner") as never);
    vi.mocked(checkAplosConnectionRateLimit).mockReturnValue(false);

    const res = await POST(req({ clientId: "c", privateKeyMaterial: "k", aplosAccountId: "o" }));
    expect(res.status).toBe(429);
  });

  it("never trusts churchId from the request body", async () => {
    const { POST, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    const { testConnection } = await import("@/lib/integrations/aplos/connectionService");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner", "real-church") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner", "real-church") as never);
    vi.mocked(testConnection).mockResolvedValue({ success: true, aplosAccountId: "org-1" } as never);

    await POST(req({ churchId: "attacker-church", clientId: "c", privateKeyMaterial: "k", aplosAccountId: "org-1" }));
    expect(vi.mocked(testConnection).mock.calls[0][0]).toBe("real-church");
  });
});
