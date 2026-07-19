import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => mockCookieStore) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    supportTicket: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    supportTicketMessage: { create: vi.fn() },
  },
}));
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn().mockResolvedValue(undefined) }));

async function loadModule(path: string) {
  vi.resetModules();
  const sessionModule = await import("@/lib/auth/session");
  const route = await import(`@/app/api/merchant/support/tickets${path}/route`);
  return { ...route, createSessionToken: sessionModule.createSessionToken };
}
function sessionCookie(createSessionToken: any, role: string, userId: string, churchId = "church-a") {
  return createSessionToken({ userId, email: `${userId}@b.com`, role, churchId, authVersion: 1 });
}
function mockUser(userId: string, role: string, churchId = "church-a") {
  return { id: userId, email: `${userId}@b.com`, churchId, role, disabledAt: null, authVersion: 1, permissionsJson: null };
}

describe("CP4D: support-ticket policy — creator-only fundraiser access, viewer denied, wgc_admin denied", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SESSION_SECRET = "test-secret-at-least-32-characters-long";
  });

  it("fundraiser's ticket list is scoped to createdByUserId, not the full org queue", async () => {
    const mod = await loadModule("");
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(mod.createSessionToken, "fundraiser", "fundraiser-a") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("fundraiser-a", "fundraiser") as never);
    vi.mocked(prisma.supportTicket.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.supportTicket.count).mockResolvedValue(0 as never);

    await mod.GET(new Request("http://x"));
    const where = (vi.mocked(prisma.supportTicket.findMany).mock.calls[0][0] as any).where;
    expect(where.createdByUserId).toBe("fundraiser-a");
  });

  it("owner's ticket list sees the full same-church queue, no createdByUserId filter", async () => {
    const mod = await loadModule("");
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(mod.createSessionToken, "owner", "owner-1") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner-1", "owner") as never);
    vi.mocked(prisma.supportTicket.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.supportTicket.count).mockResolvedValue(0 as never);

    await mod.GET(new Request("http://x"));
    const where = (vi.mocked(prisma.supportTicket.findMany).mock.calls[0][0] as any).where;
    expect(where.createdByUserId).toBeUndefined();
    expect(where.churchId).toBe("church-a");
  });

  it("viewer has no support-ticket access by default", async () => {
    const mod = await loadModule("");
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(mod.createSessionToken, "viewer", "viewer-1") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("viewer-1", "viewer") as never);

    const res = await mod.GET(new Request("http://x"));
    expect(res.status).toBe(401);
    expect(prisma.supportTicket.findMany).not.toHaveBeenCalled();
  });

  it("wgc_admin is rejected from the merchant ticket route entirely", async () => {
    const mod = await loadModule("");
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(mod.createSessionToken, "wgc_admin", "admin-1") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("admin-1", "wgc_admin") as never);

    const res = await mod.GET(new Request("http://x"));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(prisma.supportTicket.findMany).not.toHaveBeenCalled();
  });

  it("fundraiser cannot open another fundraiser's ticket by direct ID (404, not their message content)", async () => {
    const mod = await loadModule("/[ticketId]");
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(mod.createSessionToken, "fundraiser", "fundraiser-a") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("fundraiser-a", "fundraiser") as never);
    vi.mocked(prisma.supportTicket.findUnique).mockResolvedValue({ id: "t1", churchId: "church-a", createdByUserId: "fundraiser-b" } as never);

    const res = await mod.GET(new Request("http://x"), { params: Promise.resolve({ ticketId: "t1" }) });
    expect(res.status).toBe(404);
  });

  it("cross-church ticket access is denied even for the owner", async () => {
    const mod = await loadModule("/[ticketId]");
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(mod.createSessionToken, "owner", "owner-1", "church-a") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner-1", "owner", "church-a") as never);
    vi.mocked(prisma.supportTicket.findUnique).mockResolvedValue({ id: "t1", churchId: "church-b", createdByUserId: "someone" } as never);

    const res = await mod.GET(new Request("http://x"), { params: Promise.resolve({ ticketId: "t1" }) });
    expect(res.status).toBe(404);
  });

  it("fundraiser can open their own ticket", async () => {
    const mod = await loadModule("/[ticketId]");
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(mod.createSessionToken, "fundraiser", "fundraiser-a") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("fundraiser-a", "fundraiser") as never);
    vi.mocked(prisma.supportTicket.findUnique).mockResolvedValue({ id: "t1", churchId: "church-a", createdByUserId: "fundraiser-a" } as never);

    const res = await mod.GET(new Request("http://x"), { params: Promise.resolve({ ticketId: "t1" }) });
    expect(res.status).toBe(200);
  });
});
