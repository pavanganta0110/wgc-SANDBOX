import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => mockCookieStore) }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn() } } }));
vi.mock("@/lib/integrations/aplos/syncEngine", () => ({ requestManualRetry: vi.fn() }));

process.env.AUTH_SESSION_SECRET = "test-secret-at-least-32-characters-long";

async function loadModule() {
  vi.resetModules();
  const sessionModule = await import("@/lib/auth/session");
  const route = await import("@/app/api/merchant/settings/integrations/aplos/sync-records/[syncRecordId]/retry/route");
  return { ...route, createSessionToken: sessionModule.createSessionToken };
}
function sessionCookie(createSessionToken: (p: { userId: string; email: string; role: "owner" | "admin" | "fundraiser" | "viewer"; churchId: string; authVersion: number }) => string, role: "owner" | "admin" | "fundraiser" | "viewer") {
  return createSessionToken({ userId: "user-1", email: "user@b.com", role, churchId: "church-a", authVersion: 1 });
}
function mockUser(role: string) {
  return { id: "user-1", email: "user@b.com", churchId: "church-a", role, disabledAt: null, authVersion: 1, permissionsJson: null };
}
function context(syncRecordId = "sync-1") {
  return { params: Promise.resolve({ syncRecordId }) };
}

describe("POST /api/merchant/settings/integrations/aplos/sync-records/[syncRecordId]/retry", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires canManageIntegrations", async () => {
    const { POST, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "viewer") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("viewer") as never);

    const res = await POST(new Request("http://x", { method: "POST" }), context());
    expect(res.status).toBe(403);
  });

  it("scopes the retry to the caller's own church, never a body/param-supplied one", async () => {
    const { POST, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    const { requestManualRetry } = await import("@/lib/integrations/aplos/syncEngine");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner") as never);
    vi.mocked(requestManualRetry).mockResolvedValue({ outcome: "RETRY_SCHEDULED", syncRecordId: "sync-1", safeMessage: "ok" } as never);

    await POST(new Request("http://x", { method: "POST" }), context("sync-1"));
    expect(requestManualRetry).toHaveBeenCalledWith("church-a", "sync-1");
  });

  it("returns the outcome and safe message on success", async () => {
    const { POST, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    const { requestManualRetry } = await import("@/lib/integrations/aplos/syncEngine");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner") as never);
    vi.mocked(requestManualRetry).mockResolvedValue({ outcome: "SYNCED", syncRecordId: "sync-1", safeMessage: "Settlement synchronized to Aplos." } as never);

    const res = await POST(new Request("http://x", { method: "POST" }), context());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.outcome).toBe("SYNCED");
  });

  it("returns 404 when the sync record doesn't belong to this organization", async () => {
    const { POST, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    const { requestManualRetry } = await import("@/lib/integrations/aplos/syncEngine");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner") as never);
    vi.mocked(requestManualRetry).mockRejectedValue(new Error("Sync record not found for this organization."));

    const res = await POST(new Request("http://x", { method: "POST" }), context());
    expect(res.status).toBe(404);
  });

  it("refuses (via requestManualRetry's own guard) a NEEDS_REVIEW record without a special-case bypass", async () => {
    const { POST, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    const { requestManualRetry } = await import("@/lib/integrations/aplos/syncEngine");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner") as never);
    vi.mocked(requestManualRetry).mockResolvedValue({ outcome: "NEEDS_REVIEW", syncRecordId: "sync-1", safeMessage: "requires manual review" } as never);

    const res = await POST(new Request("http://x", { method: "POST" }), context());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.outcome).toBe("NEEDS_REVIEW");
  });
});
