import { describe, it, expect, vi, beforeEach } from "vitest";
import type { createSessionToken as CreateSessionTokenFn } from "@/lib/auth/session";

const mockCookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => mockCookieStore) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    aplosConnection: { findUnique: vi.fn() },
  },
}));

async function loadModule() {
  vi.resetModules();
  const sessionModule = await import("@/lib/auth/session");
  const route = await import("@/app/api/merchant/settings/integrations/aplos/status/route");
  return { ...route, createSessionToken: sessionModule.createSessionToken };
}

function sessionCookie(createSessionToken: typeof CreateSessionTokenFn, role: Parameters<typeof CreateSessionTokenFn>[0]["role"], churchId = "church-a") {
  return createSessionToken({ userId: "user-1", email: "user@b.com", role, churchId, authVersion: 1 });
}

function mockUser(role: string, churchId = "church-a") {
  return { id: "user-1", email: "user@b.com", churchId, role, disabledAt: null, authVersion: 1, permissionsJson: null };
}

describe("GET /api/merchant/settings/integrations/aplos/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SESSION_SECRET = "test-secret-at-least-32-characters-long";
  });

  it("requires authentication", async () => {
    const { GET } = await loadModule();
    mockCookieStore.get.mockReturnValue(undefined);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns NOT_CONNECTED when no connection row exists", async () => {
    const { GET, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner") as never);
    vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue(null);

    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe("NOT_CONNECTED");
  });

  it("is viewable by a viewer role (read-only, no canManageIntegrations gate on this route)", async () => {
    const { GET, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "viewer") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("viewer") as never);
    vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("never returns encryptedPrivateKey", async () => {
    const { GET, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner") as never);
    vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue({
      status: "CONNECTED",
      automaticSyncEnabled: true,
      aplosOrganizationId: "org-1",
      aplosOrganizationName: "Label",
      privateKeyFingerprint: "abcdef0123456789",
      connectedAt: new Date(),
      lastConnectionTestAt: new Date(),
      lastSuccessfulSyncAt: null,
      lastErrorAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      disconnectedAt: null,
    } as never);

    const res = await GET();
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("encryptedPrivateKey");
    expect(body.keyFingerprint).toBe("...23456789");
  });

  it("scopes the query to the authenticated session's churchId, never trusting any external input", async () => {
    const { GET, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner", "church-xyz") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner", "church-xyz") as never);
    vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue(null);

    await GET();
    expect(vi.mocked(prisma.aplosConnection.findUnique).mock.calls[0][0]).toEqual({
      where: { churchId: "church-xyz" },
      select: expect.any(Object),
    });
  });
});
