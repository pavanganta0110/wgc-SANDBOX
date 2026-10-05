import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma: any = {
  promotionEntitlement: { findMany: vi.fn() },
  promoShortfallCharge: { findUnique: vi.fn(), create: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

const mockAggregateTransfers = vi.fn();
vi.mock("@/lib/reports/dashboardAggregates", () => ({ aggregateTransfers: (...args: unknown[]) => mockAggregateTransfers(...args) }));

async function load() {
  vi.resetModules();
  return import("../promoShortfallDetection");
}

describe("resolvePriorMonthRange", () => {
  it("resolves the full previous calendar month in UTC", async () => {
    const { resolvePriorMonthRange } = await load();
    const { start, end, billingPeriod } = resolvePriorMonthRange(new Date("2026-03-15T10:00:00Z"));
    expect(billingPeriod).toBe("2026-02");
    expect(start.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });

  it("rolls the year over correctly for January", async () => {
    const { resolvePriorMonthRange } = await load();
    const { start, end, billingPeriod } = resolvePriorMonthRange(new Date("2026-01-05T00:00:00Z"));
    expect(billingPeriod).toBe("2025-12");
    expect(start.toISOString()).toBe("2025-12-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("detectPromoShortfalls", () => {
  const NOW = new Date("2026-03-15T10:00:00Z"); // checks Feb 2026

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.promoShortfallCharge.findUnique.mockResolvedValue(null);
    mockPrisma.promoShortfallCharge.create.mockResolvedValue({ id: "shortfall-1" });
  });

  it("flags an org whose prior-month volume is under the $100 threshold", async () => {
    mockPrisma.promotionEntitlement.findMany.mockResolvedValue([
      { id: "ent-1", organizationId: "church-A", startsAt: new Date("2026-01-01T00:00:00Z"), normalMonthlyAmountCents: 1000 },
    ]);
    mockAggregateTransfers.mockResolvedValue({ succeededVolumeCents: 5000, totalCount: 3, succeededCount: 3 });

    const { detectPromoShortfalls } = await load();
    const result = await detectPromoShortfalls(NOW);

    expect(mockAggregateTransfers).toHaveBeenCalledWith(
      expect.objectContaining({ churchId: "church-A", createdAtFinix: { gte: new Date("2026-02-01T00:00:00Z"), lt: new Date("2026-03-01T00:00:00Z") } })
    );
    expect(mockPrisma.promoShortfallCharge.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ organizationId: "church-A", billingPeriod: "2026-02", processedVolumeCents: 5000, thresholdCents: 10_000, chargeAmountCents: 1000, status: "FLAGGED" }) })
    );
    expect(result.newlyFlagged).toBe(1);
    expect(result.compliant).toBe(0);
  });

  it("does NOT flag an org that met the $100 threshold", async () => {
    mockPrisma.promotionEntitlement.findMany.mockResolvedValue([
      { id: "ent-1", organizationId: "church-B", startsAt: new Date("2026-01-01T00:00:00Z"), normalMonthlyAmountCents: 1000 },
    ]);
    mockAggregateTransfers.mockResolvedValue({ succeededVolumeCents: 10_000, totalCount: 1, succeededCount: 1 });

    const { detectPromoShortfalls } = await load();
    const result = await detectPromoShortfalls(NOW);

    expect(mockPrisma.promoShortfallCharge.create).not.toHaveBeenCalled();
    expect(result.compliant).toBe(1);
    expect(result.newlyFlagged).toBe(0);
  });

  it("skips an org whose promo only started mid-way through the prior month — never flags a partial month", async () => {
    mockPrisma.promotionEntitlement.findMany.mockResolvedValue([
      { id: "ent-1", organizationId: "church-C", startsAt: new Date("2026-02-20T00:00:00Z"), normalMonthlyAmountCents: 1000 },
    ]);

    const { detectPromoShortfalls } = await load();
    const result = await detectPromoShortfalls(NOW);

    expect(mockAggregateTransfers).not.toHaveBeenCalled();
    expect(mockPrisma.promoShortfallCharge.create).not.toHaveBeenCalled();
    expect(result.skippedNotFullMonth).toBe(1);
  });

  it("never double-flags the same org for the same month", async () => {
    mockPrisma.promotionEntitlement.findMany.mockResolvedValue([
      { id: "ent-1", organizationId: "church-D", startsAt: new Date("2026-01-01T00:00:00Z"), normalMonthlyAmountCents: 1000 },
    ]);
    mockPrisma.promoShortfallCharge.findUnique.mockResolvedValue({ id: "existing-flag" });

    const { detectPromoShortfalls } = await load();
    const result = await detectPromoShortfalls(NOW);

    expect(mockAggregateTransfers).not.toHaveBeenCalled();
    expect(mockPrisma.promoShortfallCharge.create).not.toHaveBeenCalled();
    expect(result.alreadyFlagged).toBe(1);
  });

  it("treats a concurrent unique-constraint violation as already-flagged rather than an error", async () => {
    mockPrisma.promotionEntitlement.findMany.mockResolvedValue([
      { id: "ent-1", organizationId: "church-E", startsAt: new Date("2026-01-01T00:00:00Z"), normalMonthlyAmountCents: 1000 },
    ]);
    mockAggregateTransfers.mockResolvedValue({ succeededVolumeCents: 0, totalCount: 0, succeededCount: 0 });
    const p2002 = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    mockPrisma.promoShortfallCharge.create.mockRejectedValue(p2002);

    const { detectPromoShortfalls } = await load();
    const result = await detectPromoShortfalls(NOW);

    expect(result.alreadyFlagged).toBe(1);
    expect(result.newlyFlagged).toBe(0);
  });
});
