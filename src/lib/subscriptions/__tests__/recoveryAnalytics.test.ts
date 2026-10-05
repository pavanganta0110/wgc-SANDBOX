import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  payment: { findMany: vi.fn() },
  subscriptionRecoveryAttempt: { findMany: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

describe("loadRecoveryAnalytics", () => {
  beforeEach(() => vi.clearAllMocks());

  it("counts a subscription as recovered only if a success comes strictly after its earliest failure", async () => {
    mockPrisma.payment.findMany
      .mockResolvedValueOnce([
        { finixSubscriptionId: "sub1", createdAt: new Date("2026-01-05") },
        { finixSubscriptionId: "sub2", createdAt: new Date("2026-01-10") },
      ])
      .mockResolvedValueOnce([
        { finixSubscriptionId: "sub1", createdAt: new Date("2026-01-06") }, // after failure -> recovered
        { finixSubscriptionId: "sub2", createdAt: new Date("2026-01-01") }, // before failure -> not recovered
      ]);
    mockPrisma.subscriptionRecoveryAttempt.findMany.mockResolvedValue([]);

    const { loadRecoveryAnalytics } = await import("../recoveryAnalytics");
    const result = await loadRecoveryAnalytics("church-a", 30);

    expect(result.failedSubscriptionCount).toBe(2);
    expect(result.recoveredSubscriptionCount).toBe(1);
    expect(result.recoveryRatePct).toBe(50);
  });

  it("reports 0% recovery rate when there are no failures", async () => {
    mockPrisma.payment.findMany.mockResolvedValueOnce([]);
    mockPrisma.subscriptionRecoveryAttempt.findMany.mockResolvedValue([]);

    const { loadRecoveryAnalytics } = await import("../recoveryAnalytics");
    const result = await loadRecoveryAnalytics("church-a", 30);

    expect(result.failedSubscriptionCount).toBe(0);
    expect(result.recoveryRatePct).toBe(0);
  });

  it("scopes the failed-payment query to the given church and window", async () => {
    mockPrisma.payment.findMany.mockResolvedValueOnce([]);
    mockPrisma.subscriptionRecoveryAttempt.findMany.mockResolvedValue([]);

    const { loadRecoveryAnalytics } = await import("../recoveryAnalytics");
    await loadRecoveryAnalytics("church-a", 7);

    expect(mockPrisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ churchId: "church-a", status: "FAILED" }) })
    );
  });
});
