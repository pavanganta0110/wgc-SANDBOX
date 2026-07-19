import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => mockCookieStore) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    church: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn().mockResolvedValue(undefined) }));

async function loadModule() {
  vi.resetModules();
  const sessionModule = await import("@/lib/auth/session");
  const route = await import("@/app/api/merchant/settings/team/[userId]/route");
  return { ...route, createSessionToken: sessionModule.createSessionToken };
}
function sessionCookie(createSessionToken: any, role: string, userId: string) {
  return createSessionToken({ userId, email: `${userId}@b.com`, role, churchId: "church-a", authVersion: 1 });
}
function mockUser(userId: string, role: string, extra: Partial<Record<string, unknown>> = {}) {
  return { id: userId, email: `${userId}@b.com`, churchId: "church-a", role, disabledAt: null, authVersion: 1, permissionsJson: null, ...extra };
}

describe("PATCH /api/merchant/settings/team/[userId] — role edit + grant-only permission overrides", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SESSION_SECRET = "test-secret-at-least-32-characters-long";
  });

  it("owner can change a fundraiser's role to admin", async () => {
    const { PATCH, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner", "owner-1") });
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(mockUser("owner-1", "owner") as never) // requireMerchantSession
      .mockResolvedValueOnce(mockUser("target-1", "fundraiser") as never); // loadTargetInOrg
    vi.mocked(prisma.church.findUnique).mockResolvedValue({ primaryOwnerUserId: "owner-1" } as never);
    vi.mocked(prisma.user.update).mockResolvedValue({ id: "target-1", role: "admin" } as never);

    const res = await PATCH(
      new Request("http://x", { method: "PATCH", body: JSON.stringify({ action: "update_role", role: "admin" }) }),
      { params: Promise.resolve({ userId: "target-1" }) }
    );
    expect(res.status).toBe(200);
    expect((vi.mocked(prisma.user.update).mock.calls[0][0] as any).data.role).toBe("admin");
  });

  it("the primary owner's role cannot be changed through this route", async () => {
    const { PATCH, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner", "owner-1") });
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(mockUser("owner-1", "owner") as never)
      .mockResolvedValueOnce(mockUser("owner-1", "owner") as never);
    vi.mocked(prisma.church.findUnique).mockResolvedValue({ primaryOwnerUserId: "owner-1" } as never);

    const res = await PATCH(
      new Request("http://x", { method: "PATCH", body: JSON.stringify({ action: "update_role", role: "admin" }) }),
      { params: Promise.resolve({ userId: "owner-1" }) }
    );
    expect(res.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("fundraiser cannot change anyone's role (requirePermission canManageTeam fails)", async () => {
    const { PATCH, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "fundraiser", "fundraiser-1") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("fundraiser-1", "fundraiser") as never);

    const res = await PATCH(
      new Request("http://x", { method: "PATCH", body: JSON.stringify({ action: "update_role", role: "admin" }) }),
      { params: Promise.resolve({ userId: "target-1" }) }
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("only allowlisted permission keys survive as grant-only overrides — unknown/false keys are dropped", async () => {
    const { PATCH, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner", "owner-1") });
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(mockUser("owner-1", "owner") as never)
      .mockResolvedValueOnce(mockUser("target-1", "fundraiser") as never);
    vi.mocked(prisma.church.findUnique).mockResolvedValue({ primaryOwnerUserId: "owner-1" } as never);
    vi.mocked(prisma.user.update).mockResolvedValue({ id: "target-1", role: "fundraiser" } as never);

    const res = await PATCH(
      new Request("http://x", {
        method: "PATCH",
        body: JSON.stringify({
          action: "update_role",
          role: "fundraiser",
          permissionOverrides: { canIssueRefunds: true, canManageOrgSettings: true, notARealKey: true, canExportReports: false },
        }),
      }),
      { params: Promise.resolve({ userId: "target-1" }) }
    );
    expect(res.status).toBe(200);
    const data = (vi.mocked(prisma.user.update).mock.calls[0][0] as any).data;
    expect(data.permissionsJson).toEqual({ canIssueRefunds: true });
  });
});
