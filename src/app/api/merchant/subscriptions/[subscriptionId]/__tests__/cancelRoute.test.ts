import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/lib/auth/requireMerchantSession", () => ({ requireMerchantSession: () => mockAuth() }));
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn().mockResolvedValue(undefined) }));

const mockFinixClient = { cancelSubscription: vi.fn().mockResolvedValue({}) };
vi.mock("@/lib/finix/client", () => ({ finixClient: mockFinixClient }));

const mockEmitEvent = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/events/emitEvent", () => ({ emitEvent: mockEmitEvent }));

const mockPrisma = {
  subscriptionAction: { findUnique: vi.fn(), create: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}) },
  finixSubscription: { findFirst: vi.fn(), update: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

function ownerAuth() {
  return { userId: "u1", email: "owner@a.com", churchId: "church-a", role: "owner", rawRole: "owner", authTime: Math.floor(Date.now() / 1000) };
}

function subscription(overrides: Partial<Record<string, unknown>> = {}) {
  return { id: "sub1", churchId: "church-a", finixSubscriptionId: "fx-sub-1", donorId: "donor1", state: "ACTIVE", canceledAt: null, completedAt: null, ...overrides };
}

function req(body: unknown) {
  return new Request("http://x", { method: "POST", body: JSON.stringify(body) });
}

async function loadRoute() {
  vi.resetModules();
  return import("../cancel/route");
}

describe("POST /api/merchant/subscriptions/[subscriptionId]/cancel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("emits recurring.cancelled for a healthy ACTIVE subscription", async () => {
    mockAuth.mockResolvedValue(ownerAuth());
    mockPrisma.subscriptionAction.findUnique.mockResolvedValue(null);
    mockPrisma.finixSubscription.findFirst.mockResolvedValue(subscription({ state: "ACTIVE" }));
    mockPrisma.finixSubscription.update.mockResolvedValue({ canceledAt: new Date() });

    const { POST } = await loadRoute();
    const res = await POST(req({ idempotencyKey: "key1" }), { params: Promise.resolve({ subscriptionId: "sub1" }) });

    expect(res.status).toBe(200);
    expect(mockEmitEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "recurring.cancelled" }));
  });

  it("emits recurring.cancelled_after_failure for a PAST_DUE subscription", async () => {
    mockAuth.mockResolvedValue(ownerAuth());
    mockPrisma.subscriptionAction.findUnique.mockResolvedValue(null);
    // A subscription with a failureCode and no successful recent charge resolves to PAST_DUE
    // via resolveSubscriptionDisplayStatus's own rules (exercised for real here, not mocked).
    mockPrisma.finixSubscription.findFirst.mockResolvedValue(subscription({ state: "PAST_DUE" }));
    mockPrisma.finixSubscription.update.mockResolvedValue({ canceledAt: new Date() });

    const { POST } = await loadRoute();
    const res = await POST(req({ idempotencyKey: "key2" }), { params: Promise.resolve({ subscriptionId: "sub1" }) });

    expect(res.status).toBe(200);
    expect(mockEmitEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "recurring.cancelled_after_failure" }));
  });
});
