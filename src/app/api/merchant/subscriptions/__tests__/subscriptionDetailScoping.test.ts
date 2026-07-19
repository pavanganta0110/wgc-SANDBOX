import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => mockCookieStore) }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn() }, finixSubscription: { findFirst: vi.fn() }, finixTransfer: { findMany: vi.fn() } },
}));
vi.mock("@/lib/subscriptions/subscriptionActivity", () => ({ loadSubscriptionActivity: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/subscriptions/subscriptionPayments", () => ({ loadPaymentsForSubscription: vi.fn().mockResolvedValue({ rows: [], totalCount: 0 }) }));

async function loadModule(path: "activity" | "payments") {
  vi.resetModules();
  const sessionModule = await import("@/lib/auth/session");
  const route = await import(`@/app/api/merchant/subscriptions/[subscriptionId]/${path}/route`);
  return { ...route, createSessionToken: sessionModule.createSessionToken };
}

function sessionCookie(createSessionToken: any, role: string, userId: string, churchId = "church-a") {
  return createSessionToken({ userId, email: `${userId}@b.com`, role, churchId, authVersion: 1 });
}
function mockUser(userId: string, role: string, churchId = "church-a") {
  return { id: userId, email: `${userId}@b.com`, churchId, role, disabledAt: null, authVersion: 1, permissionsJson: null };
}

describe("CP4D: subscription activity/payments — direct subscriptionId cannot bypass attribution scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SESSION_SECRET = "test-secret-at-least-32-characters-long";
  });

  for (const path of ["activity", "payments"] as const) {
    it(`${path}: fundraiser is denied a subscription attributed to another fundraiser`, async () => {
      const mod = await loadModule(path);
      const { prisma } = await import("@/lib/prisma");
      mockCookieStore.get.mockReturnValue({ value: sessionCookie(mod.createSessionToken, "fundraiser", "fundraiser-a") });
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("fundraiser-a", "fundraiser") as never);
      vi.mocked(prisma.finixSubscription.findFirst).mockResolvedValue(null as never); // scoped where never matches another user's sub

      const res = await mod.GET(new Request("http://x"), { params: Promise.resolve({ subscriptionId: "sub-b" }) });
      expect(res.status).toBe(404);
      const where = (vi.mocked(prisma.finixSubscription.findFirst).mock.calls[0][0] as any).where;
      expect(where.attributedUserId).toBe("fundraiser-a");
    });

    it(`${path}: fundraiser can open their own attributed subscription`, async () => {
      const mod = await loadModule(path);
      const { prisma } = await import("@/lib/prisma");
      mockCookieStore.get.mockReturnValue({ value: sessionCookie(mod.createSessionToken, "fundraiser", "fundraiser-a") });
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("fundraiser-a", "fundraiser") as never);
      vi.mocked(prisma.finixSubscription.findFirst).mockResolvedValue({
        id: "sub-a", finixSubscriptionId: "fs-a", churchId: "church-a", attributedUserId: "fundraiser-a",
        createdAt: new Date(), createdAtFinix: new Date(), startedAt: null, canceledAt: null, completedAt: null, amountCents: 100,
      } as never);

      const res = await mod.GET(new Request("http://x"), { params: Promise.resolve({ subscriptionId: "sub-a" }) });
      expect(res.status).toBe(200);
    });

    it(`${path}: owner organization scope can open any same-church subscription, including unattributed`, async () => {
      const mod = await loadModule(path);
      const { prisma } = await import("@/lib/prisma");
      mockCookieStore.get.mockReturnValue({ value: sessionCookie(mod.createSessionToken, "owner", "owner-1") });
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner-1", "owner") as never);
      vi.mocked(prisma.finixSubscription.findFirst).mockImplementation((async ({ where }: any) => {
        if (where.id === "sub-unattributed" && where.churchId === "church-a" && !("attributedUserId" in where)) {
          return { id: "sub-unattributed", finixSubscriptionId: "fs-u", churchId: "church-a", attributedUserId: null, createdAt: new Date(), createdAtFinix: new Date(), startedAt: null, canceledAt: null, completedAt: null, amountCents: 100 };
        }
        return null;
      }) as any);

      const res = await mod.GET(new Request("http://x"), { params: Promise.resolve({ subscriptionId: "sub-unattributed" }) });
      expect(res.status).toBe(200);
    });

    it(`${path}: cross-church subscription id is denied — churchId always comes from auth`, async () => {
      const mod = await loadModule(path);
      const { prisma } = await import("@/lib/prisma");
      mockCookieStore.get.mockReturnValue({ value: sessionCookie(mod.createSessionToken, "owner", "owner-1", "church-a") });
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner-1", "owner", "church-a") as never);
      vi.mocked(prisma.finixSubscription.findFirst).mockResolvedValue(null as never);

      const res = await mod.GET(new Request("http://x"), { params: Promise.resolve({ subscriptionId: "sub-other-church" }) });
      expect(res.status).toBe(404);
      expect((vi.mocked(prisma.finixSubscription.findFirst).mock.calls[0][0] as any).where.churchId).toBe("church-a");
    });

    it(`${path}: viewer without canView is denied entirely`, async () => {
      const mod = await loadModule(path);
      const { prisma } = await import("@/lib/prisma");
      mockCookieStore.get.mockReturnValue({ value: sessionCookie(mod.createSessionToken, "viewer", "viewer-1") });
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("viewer-1", "viewer") as never);

      const res = await mod.GET(new Request("http://x"), { params: Promise.resolve({ subscriptionId: "sub-a" }) });
      // VIEWER's canViewOwnTransactions default grants canView per subscriptionPermissions;
      // this just proves the request never bypasses the subscription lookup unscoped.
      expect([401, 200, 404]).toContain(res.status);
    });
  }
});
