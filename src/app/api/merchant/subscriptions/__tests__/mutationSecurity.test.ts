import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => mockCookieStore),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    subscriptionAction: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    finixSubscription: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    subscriptionSetupLink: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), create: vi.fn() },
    donor: { findFirst: vi.fn(), findMany: vi.fn() },
    church: { findUnique: vi.fn() },
    fund: { findFirst: vi.fn() },
    givingLink: { findFirst: vi.fn() },
    subscriptionConsent: { create: vi.fn() },
  },
}));

vi.mock("@/lib/finix/client", () => ({
  finixClient: { cancelSubscription: vi.fn(), createSubscription: vi.fn() },
}));

vi.mock("@/lib/subscriptions/subscriptionRecreate", () => ({
  recreateSubscriptionWithChange: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  sendWgcEmail: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/lib/dashboardAudit", () => ({
  logDashboardAction: vi.fn().mockResolvedValue(undefined),
}));

async function loadModule(path: string) {
  vi.resetModules();
  const sessionModule = await import("@/lib/auth/session");
  const route = await import(`@/app/api/merchant/subscriptions/${path}/route`);
  return { ...route, createSessionToken: sessionModule.createSessionToken };
}

function sessionCookie(createSessionToken: any, role: string, userId: string, churchId = "church-a") {
  return createSessionToken({ userId, email: `${userId}@b.com`, role, churchId, authVersion: 1 });
}

function mockUser(userId: string, role: string, churchId = "church-a") {
  return { id: userId, email: `${userId}@b.com`, churchId, role, disabledAt: null, authVersion: 1, permissionsJson: null };
}

const MUTATION_ROUTES: { path: string; method: "cancel" | "update-amount" | "update-frequency"; body: any }[] = [
  { path: "[subscriptionId]/cancel", method: "cancel", body: { idempotencyKey: "k1" } },
  { path: "[subscriptionId]/update-amount", method: "update-amount", body: { newAmountCents: 5000, idempotencyKey: "k2", consentConfirmed: true } },
  { path: "[subscriptionId]/update-frequency", method: "update-frequency", body: { newBillingInterval: "MONTHLY", idempotencyKey: "k3", consentConfirmed: true } },
];

describe("CP4C: subscription mutation routes — fundraiser and viewer denied, view scope grants no mutation permission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SESSION_SECRET = "test-secret-at-least-32-characters-long";
  });

  for (const route of MUTATION_ROUTES) {
    it(`fundraiser is denied ${route.method}`, async () => {
      const mod = await loadModule(route.path);
      const { prisma } = await import("@/lib/prisma");
      mockCookieStore.get.mockReturnValue({ value: sessionCookie(mod.createSessionToken, "fundraiser", "fundraiser-1") });
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("fundraiser-1", "fundraiser") as never);

      const res = await mod.POST(
        new Request("http://x", { method: "POST", body: JSON.stringify(route.body) }),
        { params: Promise.resolve({ subscriptionId: "sub-1" }) }
      );
      expect(res.status).toBe(401);
      expect(prisma.finixSubscription.findFirst).not.toHaveBeenCalled();
    });

    it(`viewer is denied ${route.method}`, async () => {
      const mod = await loadModule(route.path);
      const { prisma } = await import("@/lib/prisma");
      mockCookieStore.get.mockReturnValue({ value: sessionCookie(mod.createSessionToken, "viewer", "viewer-1") });
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("viewer-1", "viewer") as never);

      const res = await mod.POST(
        new Request("http://x", { method: "POST", body: JSON.stringify(route.body) }),
        { params: Promise.resolve({ subscriptionId: "sub-1" }) }
      );
      expect(res.status).toBe(401);
    });

    it(`wgc_admin is rejected from ${route.method} by requireMerchantSession before permission logic runs`, async () => {
      const mod = await loadModule(route.path);
      const { prisma } = await import("@/lib/prisma");
      mockCookieStore.get.mockReturnValue({ value: sessionCookie(mod.createSessionToken, "wgc_admin", "admin-1") });
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("admin-1", "wgc_admin") as never);

      const res = await mod.POST(
        new Request("http://x", { method: "POST", body: JSON.stringify(route.body) }),
        { params: Promise.resolve({ subscriptionId: "sub-1" }) }
      );
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(prisma.finixSubscription.findFirst).not.toHaveBeenCalled();
    });
  }

  it("owner can cancel a subscription belonging to their own church", async () => {
    const mod = await loadModule("[subscriptionId]/cancel");
    const { prisma } = await import("@/lib/prisma");
    const { finixClient } = await import("@/lib/finix/client");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(mod.createSessionToken, "owner", "owner-1") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner-1", "owner") as never);
    vi.mocked(prisma.subscriptionAction.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.finixSubscription.findFirst).mockResolvedValue({
      id: "sub-1",
      churchId: "church-a",
      finixSubscriptionId: "fs-1",
      state: "ACTIVE",
      canceledAt: null,
      completedAt: null,
    } as never);
    vi.mocked(finixClient.cancelSubscription).mockResolvedValue(undefined as never);
    vi.mocked(prisma.finixSubscription.update).mockResolvedValue({ id: "sub-1", canceledAt: new Date() } as never);

    const res = await mod.POST(
      new Request("http://x", { method: "POST", body: JSON.stringify({ idempotencyKey: "k-owner" }) }),
      { params: Promise.resolve({ subscriptionId: "sub-1" }) }
    );
    expect(res.status).toBe(200);
    const where = (vi.mocked(prisma.finixSubscription.findFirst).mock.calls[0][0] as any).where;
    expect(where.churchId).toBe("church-a");
  });

  it("cross-church subscription cancellation is denied — churchId always comes from auth", async () => {
    const mod = await loadModule("[subscriptionId]/cancel");
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(mod.createSessionToken, "owner", "owner-1", "church-a") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner-1", "owner", "church-a") as never);
    vi.mocked(prisma.subscriptionAction.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.finixSubscription.findFirst).mockResolvedValue(null as never); // belongs to church-b, never matches

    const res = await mod.POST(
      new Request("http://x", { method: "POST", body: JSON.stringify({ idempotencyKey: "k-cross" }) }),
      { params: Promise.resolve({ subscriptionId: "sub-other-church" }) }
    );
    expect(res.status).toBe(404);
  });

  it("view-as-user scope does not grant mutation permission — permission derives only from the acting role, not from view scope", async () => {
    const mod = await loadModule("[subscriptionId]/cancel");
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockImplementation((name: string) => {
      if (name === "wgc_view_scope") return undefined;
      return { value: sessionCookie(mod.createSessionToken, "fundraiser", "fundraiser-1") };
    });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("fundraiser-1", "fundraiser") as never);

    const res = await mod.POST(
      new Request("http://x", { method: "POST", body: JSON.stringify({ idempotencyKey: "k-viewas" }) }),
      { params: Promise.resolve({ subscriptionId: "sub-1" }) }
    );
    // A fundraiser is denied regardless of any view-scope cookie state —
    // getSubscriptionPermissions is derived from auth.rawRole only.
    expect(res.status).toBe(401);
  });
});

describe("CP4C: subscription setup-link and donor-matching routes migrated off getSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SESSION_SECRET = "test-secret-at-least-32-characters-long";
  });

  it("fundraiser cannot send a payment-update link", async () => {
    const mod = await loadModule("[subscriptionId]/send-payment-update-link");
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(mod.createSessionToken, "fundraiser", "fundraiser-1") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("fundraiser-1", "fundraiser") as never);

    const res = await mod.POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ subscriptionId: "sub-1" }) });
    expect(res.status).toBe(401);
  });

  it("fundraiser cannot search/match donors on a subscription", async () => {
    const mod = await loadModule("[subscriptionId]/link-donor");
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(mod.createSessionToken, "fundraiser", "fundraiser-1") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("fundraiser-1", "fundraiser") as never);

    const res = await mod.GET(new Request("http://x?q=jo"), { params: Promise.resolve({ subscriptionId: "sub-1" }) });
    expect(res.status).toBe(401);
    expect(prisma.donor.findMany).not.toHaveBeenCalled();
  });

  it("owner can list setup links scoped to their own church", async () => {
    const mod = await loadModule("setup-links");
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(mod.createSessionToken, "owner", "owner-1") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner-1", "owner") as never);
    vi.mocked(prisma.subscriptionSetupLink.findMany).mockResolvedValue([] as never);

    const res = await mod.GET(new Request("http://x"));
    expect(res.status).toBe(200);
    expect((vi.mocked(prisma.subscriptionSetupLink.findMany).mock.calls[0][0] as any).where.churchId).toBe("church-a");
  });

  it("fundraiser cannot create a subscription", async () => {
    const mod = await loadModule("create");
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(mod.createSessionToken, "fundraiser", "fundraiser-1") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("fundraiser-1", "fundraiser") as never);

    const res = await mod.POST(new Request("http://x", { method: "POST", body: JSON.stringify({ idempotencyKey: "k1" }) }));
    expect(res.status).toBe(401);
    expect(prisma.donor.findFirst).not.toHaveBeenCalled();
  });
});
