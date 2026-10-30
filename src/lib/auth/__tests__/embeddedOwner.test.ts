import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCookieStore = { get: vi.fn() };
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => mockCookieStore) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    church: { findUnique: vi.fn().mockResolvedValue({ billingSetupStatus: null, status: "ACTIVE" }) },
    wgcSubscription: { findUnique: vi.fn().mockResolvedValue(null) },
    user: { findUnique: vi.fn() },
  },
}));

async function load() {
  vi.resetModules();
  const session = await import("@/lib/auth/session");
  const { requireMerchantSession } = await import("@/lib/auth/requireMerchantSession");
  const { resolveEffectivePermissions } = await import("@/lib/auth/permissions");
  const { prisma } = await import("@/lib/prisma");
  return { requireMerchantSession, createSessionToken: session.createSessionToken, resolveEffectivePermissions, prisma };
}

async function arrange(dbRole: string, embedded: boolean, permissionsJson: unknown = null) {
  const m = await load();
  mockCookieStore.get.mockReturnValue({
    value: m.createSessionToken({ userId: "u1", email: "a@b.com", role: dbRole === "owner" && embedded ? "admin" : (dbRole as "owner"), churchId: "c1", authVersion: 1, ...(embedded ? { embedded: true } : {}) }),
  });
  vi.mocked(m.prisma.user.findUnique).mockResolvedValue({ id: "u1", email: "a@b.com", churchId: "c1", role: dbRole, disabledAt: null, authVersion: 1, permissionsJson } as never);
  return m;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.AUTH_SESSION_SECRET = "test-secret-at-least-32-characters-long";
});

describe("an owner inside a partner's frame", () => {
  it("works as an admin who can manage the team, and nothing more", async () => {
    const m = await arrange("owner", true);
    const auth = await m.requireMerchantSession();
    expect(auth.role).toBe("admin");
    expect(auth.embedded).toBe(true);
    const p = m.resolveEffectivePermissions(auth);
    expect(p.canManageTeam).toBe(true);
    expect(p.canManageBankAccount).toBe(false);
    expect(p.canManageBilling).toBe(false);
    expect(p.canManageApiKeys).toBe(false);
    expect(p.canManageRolesAndPermissions).toBe(false);
  });

  it("keeps the owner's own permission overrides and adds only the team permission", async () => {
    const m = await arrange("owner", true, { canExportReports: false });
    const auth = await m.requireMerchantSession();
    expect(auth.permissionsJson).toEqual({ canExportReports: false, canManageTeam: true });
  });

  it("does not give team management to an admin or fundraiser in the frame", async () => {
    for (const role of ["admin", "fundraiser", "viewer"]) {
      const m = await arrange(role, true);
      const auth = await m.requireMerchantSession();
      expect(m.resolveEffectivePermissions(auth).canManageTeam).toBe(false);
    }
  });

  it("an owner signed in directly at WGC is unchanged: a full owner", async () => {
    const m = await arrange("owner", false);
    const auth = await m.requireMerchantSession();
    expect(auth.role).toBe("owner");
    expect(auth.embedded).toBeUndefined();
    expect(m.resolveEffectivePermissions(auth).canManageBankAccount).toBe(true);
  });
});
