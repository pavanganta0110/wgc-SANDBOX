import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => mockCookieStore) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    donor: { findFirst: vi.fn() },
    payment: { findMany: vi.fn() },
    finixSubscription: { findMany: vi.fn() },
    finixPaymentInstrumentSnapshot: { findMany: vi.fn() },
  },
}));

async function loadModule() {
  vi.resetModules();
  const sessionModule = await import("@/lib/auth/session");
  const route = await import("@/app/api/merchant/recurring-donors/[donorId]/payment-methods/route");
  return { ...route, createSessionToken: sessionModule.createSessionToken };
}

function sessionCookie(createSessionToken: any, role: string, userId: string) {
  return createSessionToken({ userId, email: `${userId}@b.com`, role, churchId: "church-a", authVersion: 1 });
}
function mockUser(userId: string, role: string) {
  return { id: userId, email: `${userId}@b.com`, churchId: "church-a", role, disabledAt: null, authVersion: 1, permissionsJson: null };
}

describe("CP4D: recurring-donor payment methods — masked-only data, no cross-fundraiser leakage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SESSION_SECRET = "test-secret-at-least-32-characters-long";
  });

  it("fundraiser A sees only the instrument backing their own attributed subscription", async () => {
    const { GET, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "fundraiser", "fundraiser-a") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("fundraiser-a", "fundraiser") as never);
    // Donor qualifies via an attributed payment.
    vi.mocked(prisma.payment.findMany).mockResolvedValue([{ donorId: "donor-1" }] as never);
    vi.mocked(prisma.finixSubscription.findMany).mockResolvedValue([]);
    vi.mocked(prisma.donor.findFirst).mockResolvedValue({ id: "donor-1", churchId: "church-a" } as never);
    vi.mocked(prisma.finixPaymentInstrumentSnapshot.findMany).mockResolvedValue([
      { finixPaymentInstrumentId: "instr-a", cardBrand: "VISA", cardLast4: "1111" },
      { finixPaymentInstrumentId: "instr-b", cardBrand: "VISA", cardLast4: "2222" },
    ] as never);
    // Only instr-a is backed by fundraiser-a's attributed subscription.
    vi.mocked(prisma.finixSubscription.findMany).mockImplementation((async ({ where }: any) => {
      if (where.attributedUserId === "fundraiser-a") return [{ finixPaymentInstrumentId: "instr-a" }];
      return [{ finixPaymentInstrumentId: "instr-a" }];
    }) as any);

    const res = await GET(new Request("http://x"), { params: Promise.resolve({ donorId: "donor-1" }) });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.paymentMethods.map((m: any) => m.finixPaymentInstrumentId)).toEqual(["instr-a"]);
    // Masked metadata only — no raw card number field is ever present on the model/response.
    expect(body.paymentMethods[0]).not.toHaveProperty("cardNumber");
    expect(body.paymentMethods[0].cardLast4).toBe("1111");
  });

  it("owner organization scope sees all instruments for the donor, unfiltered by attribution", async () => {
    const { GET, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner", "owner-1") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner-1", "owner") as never);
    vi.mocked(prisma.donor.findFirst).mockResolvedValue({ id: "donor-1", churchId: "church-a" } as never);
    vi.mocked(prisma.finixPaymentInstrumentSnapshot.findMany).mockResolvedValue([
      { finixPaymentInstrumentId: "instr-a", cardBrand: "VISA", cardLast4: "1111" },
      { finixPaymentInstrumentId: "instr-b", cardBrand: "VISA", cardLast4: "2222" },
    ] as never);
    vi.mocked(prisma.finixSubscription.findMany).mockResolvedValue([] as never);

    const res = await GET(new Request("http://x"), { params: Promise.resolve({ donorId: "donor-1" }) });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.paymentMethods).toHaveLength(2);
  });

  it("cross-church donor id is denied for a non-qualifying fundraiser", async () => {
    const { GET, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "fundraiser", "fundraiser-a") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("fundraiser-a", "fundraiser") as never);
    vi.mocked(prisma.payment.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.finixSubscription.findMany).mockResolvedValue([] as never);

    const res = await GET(new Request("http://x"), { params: Promise.resolve({ donorId: "donor-not-theirs" }) });
    expect(res.status).toBe(404);
    expect(prisma.donor.findFirst).not.toHaveBeenCalled();
  });
});
