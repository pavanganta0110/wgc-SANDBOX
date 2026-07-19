import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => mockCookieStore),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    payment: { findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/payments/backfill", () => ({
  reconcilePaymentFees: vi.fn().mockResolvedValue(null),
}));

async function loadModule() {
  vi.resetModules();
  const sessionModule = await import("@/lib/auth/session");
  const route = await import("@/app/api/merchant/transactions/payments/[transferId]/route");
  return { ...route, createSessionToken: sessionModule.createSessionToken };
}

function sessionCookie(createSessionToken: any, role: string, userId: string) {
  return createSessionToken({ userId, email: `${userId}@b.com`, role, churchId: "church-a", authVersion: 1 });
}

function mockUser(userId: string, role: string, churchId = "church-a") {
  return { id: userId, email: `${userId}@b.com`, churchId, role, disabledAt: null, authVersion: 1, permissionsJson: null };
}

describe("GET /api/merchant/transactions/payments/[transferId] — CP4B payment detail security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SESSION_SECRET = "test-secret-at-least-32-characters-long";
  });

  it("test: fundraiser can open their own attributed payment", async () => {
    const { GET, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "fundraiser", "fundraiser-1") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("fundraiser-1", "fundraiser") as never);
    vi.mocked(prisma.payment.findFirst).mockImplementation((async ({ where }: any) => {
      // Simulate the DB actually enforcing the combined where clause.
      if (where.finixTransferId === "t1" && where.attributedUserId === "fundraiser-1" && where.churchId === "church-a") {
        return { id: "p1", finixTransferId: "t1", feeCalculationVersion: "v1", amountCents: 100 } as never;
      }
      return null;
    }) as any);

    const res = await GET(new Request("http://x"), { params: Promise.resolve({ transferId: "t1" }) });
    expect(res.status).toBe(200);
  });

  it("test: fundraiser gets 404 for another user's payment", async () => {
    const { GET, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "fundraiser", "fundraiser-1") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("fundraiser-1", "fundraiser") as never);
    // The query is scoped to attributedUserId: "fundraiser-1" — a payment
    // attributed to someone else never matches, so findFirst returns null.
    vi.mocked(prisma.payment.findFirst).mockResolvedValue(null as never);

    const res = await GET(new Request("http://x"), { params: Promise.resolve({ transferId: "t-owned-by-someone-else" }) });
    expect(res.status).toBe(404);
  });

  it("test: fundraiser gets 404 for an unattributed payment", async () => {
    const { GET, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "fundraiser", "fundraiser-1") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("fundraiser-1", "fundraiser") as never);
    // buildPaymentScope for a fundraiser is {churchId, attributedUserId:
    // "fundraiser-1"} — attributedUserId: null never matches that filter.
    vi.mocked(prisma.payment.findFirst).mockResolvedValue(null as never);

    const res = await GET(new Request("http://x"), { params: Promise.resolve({ transferId: "t-unattributed" }) });
    expect(res.status).toBe(404);
    const calledWhere = (vi.mocked(prisma.payment.findFirst).mock.calls[0][0] as any).where;
    expect(calledWhere).toMatchObject({ attributedUserId: "fundraiser-1" });
  });

  it("test: owner organization scope can open any same-church payment, including unattributed ones", async () => {
    const { GET, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner", "owner-1") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner-1", "owner") as never);
    vi.mocked(prisma.payment.findFirst).mockImplementation((async ({ where }: any) => {
      // Owner's default scope has no attributedUserId key at all.
      if (where.finixTransferId === "t-unattributed" && where.churchId === "church-a" && !("attributedUserId" in where)) {
        return { id: "p2", finixTransferId: "t-unattributed", feeCalculationVersion: "v1", amountCents: 500 } as never;
      }
      return null;
    }) as any);

    const res = await GET(new Request("http://x"), { params: Promise.resolve({ transferId: "t-unattributed" }) });
    expect(res.status).toBe(200);
  });

  it("test: cross-church payment access is denied (churchId always comes from auth, never the request)", async () => {
    const { GET, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner", "owner-1") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner-1", "owner", "church-a") as never);
    vi.mocked(prisma.payment.findFirst).mockImplementation((async ({ where }: any) => {
      // Payment actually belongs to church-b — never matches church-a's scope.
      if (where.churchId === "church-b") return { id: "p3" } as never;
      return null;
    }) as any);

    const res = await GET(new Request("http://x"), { params: Promise.resolve({ transferId: "t-other-church" }) });
    expect(res.status).toBe(404);
    expect((vi.mocked(prisma.payment.findFirst).mock.calls[0][0] as any).where.churchId).toBe("church-a");
  });
});
