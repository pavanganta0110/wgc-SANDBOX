import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => mockCookieStore) }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn() }, aplosSyncRecord: { findMany: vi.fn() } } }));

process.env.AUTH_SESSION_SECRET = "test-secret-at-least-32-characters-long";

async function loadModule() {
  vi.resetModules();
  const sessionModule = await import("@/lib/auth/session");
  const route = await import("@/app/api/merchant/settings/integrations/aplos/sync-history/route");
  return { ...route, createSessionToken: sessionModule.createSessionToken };
}
function sessionCookie(createSessionToken: (p: { userId: string; email: string; role: "owner" | "admin" | "fundraiser" | "viewer"; churchId: string; authVersion: number }) => string, role: "owner" | "admin" | "fundraiser" | "viewer") {
  return createSessionToken({ userId: "user-1", email: "user@b.com", role, churchId: "church-a", authVersion: 1 });
}
function mockUser(role: string) {
  return { id: "user-1", email: "user@b.com", churchId: "church-a", role, disabledAt: null, authVersion: 1, permissionsJson: null };
}

describe("GET /api/merchant/settings/integrations/aplos/sync-history", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires authentication", async () => {
    const { GET } = await loadModule();
    mockCookieStore.get.mockReturnValue(undefined);
    const res = await GET(new Request("http://x"));
    expect(res.status).toBe(401);
  });

  it("is viewable by a read-only viewer (no canManageIntegrations required)", async () => {
    const { GET, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "viewer") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("viewer") as never);
    vi.mocked(prisma.aplosSyncRecord.findMany).mockResolvedValue([{ id: "sync-1", status: "SYNCED" }] as never);

    const res = await GET(new Request("http://x"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.records).toHaveLength(1);
  });

  it("scopes the query to the caller's own church", async () => {
    const { GET, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner") as never);
    vi.mocked(prisma.aplosSyncRecord.findMany).mockResolvedValue([] as never);

    await GET(new Request("http://x"));
    expect(prisma.aplosSyncRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { churchId: "church-a" } }));
  });

  it("caps the limit query param at 100", async () => {
    const { GET, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner") as never);
    vi.mocked(prisma.aplosSyncRecord.findMany).mockResolvedValue([] as never);

    await GET(new Request("http://x?limit=9999"));
    expect(prisma.aplosSyncRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100 }));
  });
});
