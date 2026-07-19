import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => mockCookieStore),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    church: { findUnique: vi.fn() },
    finixAuthorization: { findMany: vi.fn() },
    finixPaymentInstrumentSnapshot: { findMany: vi.fn() },
    finixTransfer: { findMany: vi.fn() },
    donor: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/finix/sync/syncAuthorizations", () => ({
  syncAuthorizations: vi.fn().mockResolvedValue({ synced: 0 }),
}));

async function loadModule(path: "export" | "sync") {
  vi.resetModules();
  const sessionModule = await import("@/lib/auth/session");
  const route = await import(`@/app/api/merchant/transactions/authorizations/${path}/route`);
  return { ...route, createSessionToken: sessionModule.createSessionToken };
}

function sessionCookie(createSessionToken: any, role: string, userId: string) {
  return createSessionToken({ userId, email: `${userId}@b.com`, role, churchId: "church-a", authVersion: 1 });
}

function mockUser(userId: string, role: string, churchId = "church-a") {
  return { id: userId, email: `${userId}@b.com`, churchId, role, disabledAt: null, authVersion: 1, permissionsJson: null };
}

describe("GET /api/merchant/transactions/authorizations/export — CP4C organization-scope-only authorization export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SESSION_SECRET = "test-secret-at-least-32-characters-long";
  });

  it("owner can export authorizations", async () => {
    const { GET, createSessionToken } = await loadModule("export");
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner", "owner-1") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner-1", "owner") as never);
    vi.mocked(prisma.finixAuthorization.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.church.findUnique).mockResolvedValue({ id: "church-a", name: "Test Church" } as never);

    const res = await GET(new Request("http://x"));
    expect(res.status).toBe(200);
    expect((vi.mocked(prisma.finixAuthorization.findMany).mock.calls[0][0] as any).where.churchId).toBe("church-a");
  });

  it("fundraiser is denied — no unscoped fallback for a resource with no attribution field", async () => {
    const { GET, createSessionToken } = await loadModule("export");
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "fundraiser", "fundraiser-1") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("fundraiser-1", "fundraiser") as never);

    const res = await GET(new Request("http://x"));
    expect(res.status).toBe(401);
    expect(prisma.finixAuthorization.findMany).not.toHaveBeenCalled();
  });

  it("viewer is denied", async () => {
    const { GET, createSessionToken } = await loadModule("export");
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "viewer", "viewer-1") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("viewer-1", "viewer") as never);

    const res = await GET(new Request("http://x"));
    expect(res.status).toBe(401);
  });

  it("wgc_admin is rejected by requireMerchantSession before permission logic is even reached", async () => {
    const { GET, createSessionToken } = await loadModule("export");
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "wgc_admin", "admin-1") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("admin-1", "wgc_admin") as never);

    const res = await GET(new Request("http://x"));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(prisma.finixAuthorization.findMany).not.toHaveBeenCalled();
  });

  it("cross-church data never leaks — churchId always comes from auth", async () => {
    const { GET, createSessionToken } = await loadModule("export");
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner", "owner-1") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner-1", "owner", "church-a") as never);
    vi.mocked(prisma.finixAuthorization.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.church.findUnique).mockResolvedValue({ id: "church-a", name: "Test Church" } as never);

    await GET(new Request("http://x?state=CAPTURED"));
    const where = (vi.mocked(prisma.finixAuthorization.findMany).mock.calls[0][0] as any).where;
    expect(where.churchId).toBe("church-a");
  });
});

describe("POST /api/merchant/transactions/authorizations/sync — CP4C sync requires proper permission and full organization context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SESSION_SECRET = "test-secret-at-least-32-characters-long";
  });

  it("owner can trigger sync", async () => {
    const { POST, createSessionToken } = await loadModule("sync");
    const { prisma } = await import("@/lib/prisma");
    const { syncAuthorizations } = await import("@/lib/finix/sync/syncAuthorizations");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner", "owner-1") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner-1", "owner") as never);
    vi.mocked(prisma.church.findUnique).mockResolvedValue({ id: "church-a", finixMerchantId: "MU123" } as never);

    const res = await POST(new Request("http://x", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(syncAuthorizations).toHaveBeenCalledWith("MU123", "church-a");
  });

  it("fundraiser cannot trigger sync", async () => {
    const { POST, createSessionToken } = await loadModule("sync");
    const { prisma } = await import("@/lib/prisma");
    const { syncAuthorizations } = await import("@/lib/finix/sync/syncAuthorizations");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "fundraiser", "fundraiser-1") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("fundraiser-1", "fundraiser") as never);

    const res = await POST(new Request("http://x", { method: "POST" }));
    expect(res.status).toBe(401);
    expect(syncAuthorizations).not.toHaveBeenCalled();
  });

  it("view-as-user scope does not grant sync — mutation permission is never derived from view scope", async () => {
    const { POST, createSessionToken } = await loadModule("sync");
    const { prisma } = await import("@/lib/prisma");
    const { syncAuthorizations } = await import("@/lib/finix/sync/syncAuthorizations");
    mockCookieStore.get.mockImplementation((name: string) => {
      if (name === "wgc_view_scope") return { value: "forged-or-stale-cookie-value" };
      return { value: sessionCookie(createSessionToken, "owner", "owner-1") };
    });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner-1", "owner") as never);
    vi.mocked(prisma.church.findUnique).mockResolvedValue({ id: "church-a", finixMerchantId: "MU123" } as never);

    // An invalid/forged view-scope cookie must never grant elevated access —
    // it's silently ignored (falls back to organization scope) rather than trusted.
    const res = await POST(new Request("http://x", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(syncAuthorizations).toHaveBeenCalled();
  });
});
