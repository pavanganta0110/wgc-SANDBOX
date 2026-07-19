import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => mockCookieStore),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    church: { findUnique: vi.fn() },
    givingLink: { count: vi.fn() },
    payment: { count: vi.fn() },
    finixSubscription: { count: vi.fn() },
    dashboardAuditLog: { count: vi.fn() },
  },
}));

vi.mock("@/lib/dashboardAudit", () => ({
  logDashboardAction: vi.fn(),
}));

async function loadModule() {
  vi.resetModules();
  const sessionModule = await import("@/lib/auth/session");
  const route = await import("@/app/api/merchant/settings/team/[userId]/route");
  return { ...route, createSessionToken: sessionModule.createSessionToken };
}

function ownerSessionCookie(createSessionToken: any) {
  return createSessionToken({ userId: "owner-1", email: "owner@b.com", role: "owner", churchId: "church-a", authVersion: 1 });
}

describe("PATCH /api/merchant/settings/team/[userId] (disable/enable)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SESSION_SECRET = "test-secret-at-least-32-characters-long";
  });

  it("test 25: rejects disabling the primary owner even if the actor otherwise has canManageTeam", async () => {
    const { PATCH, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: ownerSessionCookie(createSessionToken) });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "owner-1",
      email: "owner@b.com",
      churchId: "church-a",
      role: "owner",
      disabledAt: null,
      authVersion: 1,
      permissionsJson: null,
    } as never);

    const req = new Request("http://x/api/merchant/settings/team/target-1", {
      method: "PATCH",
      body: JSON.stringify({ action: "disable" }),
    });
    // findUnique is called twice: once by requireMerchantSession, once by loadTargetInOrg
    vi.mocked(prisma.user.findUnique).mockImplementation((async ({ where }: any) => {
      if (where.id === "owner-1") {
        return { id: "owner-1", email: "owner@b.com", churchId: "church-a", role: "owner", disabledAt: null, authVersion: 1, permissionsJson: null } as never;
      }
      if (where.id === "target-1") {
        return { id: "target-1", email: "target@b.com", churchId: "church-a", role: "admin", disabledAt: null, passwordHash: "x" } as never;
      }
      return null as never;
    }) as any);
    vi.mocked(prisma.church.findUnique).mockResolvedValue({ primaryOwnerUserId: "target-1" } as never);

    const res = await PATCH(req, { params: Promise.resolve({ userId: "target-1" }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/primary owner/i);
  });

  it("Checkpoint 3 correction #3: bumps authVersion when disabling a team member (immediate session invalidation)", async () => {
    const { PATCH, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: ownerSessionCookie(createSessionToken) });
    vi.mocked(prisma.user.findUnique).mockImplementation((async ({ where }: any) => {
      if (where.id === "owner-1") {
        return { id: "owner-1", email: "owner@b.com", churchId: "church-a", role: "owner", disabledAt: null, authVersion: 1, permissionsJson: null } as never;
      }
      if (where.id === "target-1") {
        return { id: "target-1", email: "target@b.com", churchId: "church-a", role: "admin", disabledAt: null, passwordHash: "x" } as never;
      }
      return null as never;
    }) as any);
    vi.mocked(prisma.church.findUnique).mockResolvedValue({ primaryOwnerUserId: "owner-1" } as never);
    vi.mocked(prisma.user.update).mockResolvedValue({ id: "target-1", disabledAt: new Date() } as never);

    const req = new Request("http://x/api/merchant/settings/team/target-1", {
      method: "PATCH",
      body: JSON.stringify({ action: "disable" }),
    });
    await PATCH(req, { params: Promise.resolve({ userId: "target-1" }) });

    const authVersionBumpCall = vi.mocked(prisma.user.update).mock.calls.find(
      (call) => call[0].where.id === "target-1" && (call[0].data as any).authVersion
    );
    expect(authVersionBumpCall).toBeTruthy();
  });
});

describe("DELETE /api/merchant/settings/team/[userId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SESSION_SECRET = "test-secret-at-least-32-characters-long";
  });

  it("test 18/29: never calls prisma.user.delete/deleteMany, even for a never-activated invite with zero history", async () => {
    const { DELETE, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    (prisma as any).user.delete = vi.fn();
    (prisma as any).user.deleteMany = vi.fn();
    mockCookieStore.get.mockReturnValue({ value: ownerSessionCookie(createSessionToken) });
    vi.mocked(prisma.user.findUnique).mockImplementation((async ({ where }: any) => {
      if (where.id === "owner-1") {
        return { id: "owner-1", email: "owner@b.com", churchId: "church-a", role: "owner", disabledAt: null, authVersion: 1, permissionsJson: null } as never;
      }
      if (where.id === "target-1") {
        return { id: "target-1", email: "target@b.com", churchId: "church-a", role: "fundraiser", disabledAt: null, passwordHash: null } as never;
      }
      return null as never;
    }) as any);
    vi.mocked(prisma.church.findUnique).mockResolvedValue({ primaryOwnerUserId: "owner-1" } as never);
    vi.mocked(prisma.givingLink.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.payment.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.finixSubscription.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.dashboardAuditLog.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.user.update).mockResolvedValue({ id: "target-1" } as never);

    const req = new Request("http://x/api/merchant/settings/team/target-1", { method: "DELETE" });
    const res = await DELETE(req, { params: Promise.resolve({ userId: "target-1" }) });

    expect(res.status).toBe(200);
    expect((prisma as any).user.delete).not.toHaveBeenCalled();
    expect((prisma as any).user.deleteMany).not.toHaveBeenCalled();
  });

  it("soft-disables and revokes the pending invite token instead of deleting", async () => {
    const { DELETE, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: ownerSessionCookie(createSessionToken) });
    vi.mocked(prisma.user.findUnique).mockImplementation((async ({ where }: any) => {
      if (where.id === "owner-1") {
        return { id: "owner-1", email: "owner@b.com", churchId: "church-a", role: "owner", disabledAt: null, authVersion: 1, permissionsJson: null } as never;
      }
      if (where.id === "target-1") {
        return { id: "target-1", email: "target@b.com", churchId: "church-a", role: "fundraiser", disabledAt: null, passwordHash: "x" } as never;
      }
      return null as never;
    }) as any);
    vi.mocked(prisma.church.findUnique).mockResolvedValue({ primaryOwnerUserId: "owner-1" } as never);
    vi.mocked(prisma.givingLink.count).mockResolvedValue(2 as never);
    vi.mocked(prisma.payment.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.finixSubscription.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.dashboardAuditLog.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.user.update).mockResolvedValue({ id: "target-1" } as never);

    const req = new Request("http://x/api/merchant/settings/team/target-1", { method: "DELETE" });
    const res = await DELETE(req, { params: Promise.resolve({ userId: "target-1" }) });

    expect(res.status).toBe(200);
    const updateCall = vi.mocked(prisma.user.update).mock.calls.find((c) => c[0].where.id === "target-1");
    expect(updateCall?.[0].data).toMatchObject({
      disabledByUserId: "owner-1",
      setPasswordTokenHash: null,
      setPasswordTokenExpiresAt: null,
    });
    expect((updateCall?.[0].data as any).disabledAt).toBeInstanceOf(Date);
  });

  it("rejects removing the primary owner", async () => {
    const { DELETE, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: ownerSessionCookie(createSessionToken) });
    vi.mocked(prisma.user.findUnique).mockImplementation((async ({ where }: any) => {
      if (where.id === "owner-1") {
        return { id: "owner-1", email: "owner@b.com", churchId: "church-a", role: "owner", disabledAt: null, authVersion: 1, permissionsJson: null } as never;
      }
      if (where.id === "target-1") {
        return { id: "target-1", email: "target@b.com", churchId: "church-a", role: "admin", disabledAt: null, passwordHash: "x" } as never;
      }
      return null as never;
    }) as any);
    vi.mocked(prisma.church.findUnique).mockResolvedValue({ primaryOwnerUserId: "target-1" } as never);

    const req = new Request("http://x/api/merchant/settings/team/target-1", { method: "DELETE" });
    const res = await DELETE(req, { params: Promise.resolve({ userId: "target-1" }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/primary owner/i);
  });
});
