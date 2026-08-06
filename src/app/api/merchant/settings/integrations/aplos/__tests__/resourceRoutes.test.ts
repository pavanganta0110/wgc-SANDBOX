import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => mockCookieStore) }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn() } } }));
vi.mock("@/lib/integrations/aplos/resourceService", () => ({
  fetchChurchPurposes: vi.fn(),
  fetchChurchAccounts: vi.fn(),
  fetchChurchFunds: vi.fn(),
}));

process.env.AUTH_SESSION_SECRET = "test-secret-at-least-32-characters-long";

async function loadRoute(name: "purposes" | "accounts" | "funds") {
  vi.resetModules();
  const sessionModule = await import("@/lib/auth/session");
  const route = await import(`@/app/api/merchant/settings/integrations/aplos/${name}/route`);
  return { ...route, createSessionToken: sessionModule.createSessionToken };
}
function sessionCookie(createSessionToken: (p: { userId: string; email: string; role: "owner" | "admin" | "fundraiser" | "viewer"; churchId: string; authVersion: number }) => string, role: "owner" | "admin" | "fundraiser" | "viewer") {
  return createSessionToken({ userId: "user-1", email: "user@b.com", role, churchId: "church-a", authVersion: 1 });
}
function mockUser(role: string) {
  return { id: "user-1", email: "user@b.com", churchId: "church-a", role, disabledAt: null, authVersion: 1, permissionsJson: null };
}

describe.each([
  { name: "purposes" as const, path: "@/app/api/merchant/settings/integrations/aplos/purposes/route", serviceFn: "fetchChurchPurposes" as const },
  { name: "accounts" as const, path: "@/app/api/merchant/settings/integrations/aplos/accounts/route", serviceFn: "fetchChurchAccounts" as const },
  { name: "funds" as const, path: "@/app/api/merchant/settings/integrations/aplos/funds/route", serviceFn: "fetchChurchFunds" as const },
])("GET %s route", ({ name, serviceFn }) => {
  beforeEach(() => vi.clearAllMocks());

  it("requires authentication", async () => {
    const { GET } = await loadRoute(name);
    mockCookieStore.get.mockReturnValue(undefined);
    const res = await GET(new Request(`http://x/${name}`));
    expect(res.status).toBe(401);
  });

  it("viewer is denied — resource retrieval requires canManageIntegrations", async () => {
    const { GET, createSessionToken } = await loadRoute(name);
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "viewer") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("viewer") as never);

    const res = await GET(new Request(`http://x/${name}`));
    expect(res.status).toBe(403);
  });

  it("owner succeeds and receives only safe display fields", async () => {
    const { GET, createSessionToken } = await loadRoute(name);
    const { prisma } = await import("@/lib/prisma");
    const service = await import("@/lib/integrations/aplos/resourceService");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner") as never);
    vi.mocked(service[serviceFn]).mockResolvedValue({ success: true, data: [] } as never);

    const res = await GET(new Request(`http://x/${name}`));
    expect(res.status).toBe(200);
    expect(vi.mocked(service[serviceFn]).mock.calls[0][0]).toBe("church-a"); // always the session's church
  });

  it("returns a safe 502 on an Aplos-side failure, never a raw exception", async () => {
    const { GET, createSessionToken } = await loadRoute(name);
    const { prisma } = await import("@/lib/prisma");
    const service = await import("@/lib/integrations/aplos/resourceService");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner") as never);
    vi.mocked(service[serviceFn]).mockResolvedValue({ success: false, normalized: { category: "ACCESS_DENIED", retryable: false, safeMessage: "Access denied." } } as never);

    const res = await GET(new Request(`http://x/${name}`));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("Access denied.");
  });
});
