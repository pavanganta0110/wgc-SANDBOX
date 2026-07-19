import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  user: { findFirst: vi.fn() },
  givingLink: { count: vi.fn(), findMany: vi.fn() },
  payment: { findMany: vi.fn() },
  finixRefundOrReversal: { findMany: vi.fn() },
  finixSubscription: { findMany: vi.fn() },
  donor: { findMany: vi.fn() },
};

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/subscriptions/subscriptionAggregates", () => ({
  loadSubscriptionCandidates: vi.fn(async (_churchId: string, filters: any) => ({ __calledWith: filters })),
}));

async function loadModule() {
  vi.resetModules();
  return import("@/lib/settings/teamMemberDetail");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loadTeamMemberSummary", () => {
  it("scopes gross/refund/transaction aggregates to the selected userId only", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: "user-1",
      email: "u1@church.com",
      role: "fundraiser",
      disabledAt: null,
      lastLoginAt: null,
    });
    mockPrisma.givingLink.count.mockResolvedValue(2);
    mockPrisma.payment.findMany.mockResolvedValue([
      { finixTransferId: "tr-1", amountCents: 1000, status: "SUCCEEDED", createdAt: new Date("2026-01-01") },
      { finixTransferId: "tr-2", amountCents: 500, status: "FAILED", createdAt: new Date("2026-01-02") },
    ]);
    mockPrisma.finixRefundOrReversal.findMany.mockResolvedValue([{ amountCents: 200 }]);
    mockPrisma.finixSubscription.findMany.mockResolvedValue([{ donorId: "d-1", state: "ACTIVE" }]);

    const { loadTeamMemberSummary } = await loadModule();
    const summary = await loadTeamMemberSummary("church-a", "user-1");

    expect(mockPrisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ churchId: "church-a", attributedUserId: "user-1" }) })
    );
    expect(mockPrisma.givingLink.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ ownerUserId: "user-1", status: "ACTIVE" }) })
    );
    expect(summary?.grossRaisedCents).toBe(1000); // only the SUCCEEDED payment counts
    expect(summary?.refundAmountCents).toBe(200);
    expect(summary?.netRaisedCents).toBe(800);
    expect(summary?.transactionCount).toBe(2); // both payments count toward transaction count
  });

  it("returns null for a userId that does not belong to the given church (cross-church rejected)", async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    const { loadTeamMemberSummary } = await loadModule();
    const summary = await loadTeamMemberSummary("church-a", "user-in-other-church");
    expect(summary).toBeNull();
    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user-in-other-church", churchId: "church-a" } })
    );
  });

  it("disabled user's historical metrics remain visible (lookup is not filtered by disabledAt)", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: "disabled-1",
      email: "gone@church.com",
      role: "fundraiser",
      disabledAt: new Date("2026-01-01"),
      lastLoginAt: null,
    });
    mockPrisma.givingLink.count.mockResolvedValue(0);
    mockPrisma.payment.findMany.mockResolvedValue([
      { finixTransferId: "tr-1", amountCents: 2500, status: "SUCCEEDED", createdAt: new Date("2025-06-01") },
    ]);
    mockPrisma.finixRefundOrReversal.findMany.mockResolvedValue([]);
    mockPrisma.finixSubscription.findMany.mockResolvedValue([]);

    const { loadTeamMemberSummary } = await loadModule();
    const summary = await loadTeamMemberSummary("church-a", "disabled-1");

    expect(summary?.disabled).toBe(true);
    expect(summary?.grossRaisedCents).toBe(2500);
  });
});

describe("loadTeamMemberGivingLinks", () => {
  it("only fetches giving links owned by the selected user, never another member's", async () => {
    mockPrisma.givingLink.findMany.mockResolvedValue([]);
    const { loadTeamMemberGivingLinks } = await loadModule();
    await loadTeamMemberGivingLinks("church-a", "user-1");
    expect(mockPrisma.givingLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { churchId: "church-a", ownerUserId: "user-1" } })
    );
  });
});

describe("loadTeamMemberTransactions", () => {
  it("only fetches payments attributed to the selected user, excluding other members' payments", async () => {
    mockPrisma.payment.findMany.mockResolvedValue([]);
    const { loadTeamMemberTransactions } = await loadModule();
    await loadTeamMemberTransactions("church-a", "user-1");
    expect(mockPrisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ churchId: "church-a", attributedUserId: "user-1" }) })
    );
  });
});

describe("loadTeamMemberRecurring", () => {
  it("delegates to the existing subscription loader scoped by attributedUserId (reuses, does not duplicate, the reporting system)", async () => {
    const { loadTeamMemberRecurring } = await loadModule();
    const result: any = await loadTeamMemberRecurring("church-a", "user-1");
    expect(result.__calledWith).toEqual({ attributedUserId: "user-1" });
  });
});
