import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma: any = {
  promotionLead: { findFirst: vi.fn(), update: vi.fn() },
  promotion: { findUnique: vi.fn() },
  promotionEntitlement: { findFirst: vi.fn(), create: vi.fn() },
  // Mirrors the mock shape used in provisionChurchAccount.test.ts — the
  // transaction callback just gets mockPrisma back as `tx`, so assertions
  // on mockPrisma.promotionEntitlement.* still see calls made inside it.
  $transaction: vi.fn((fn: any) => fn(mockPrisma)),
  $queryRaw: vi.fn().mockResolvedValue([{ locked: true }]),
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

async function load() {
  vi.resetModules();
  return import("@/lib/billing/promotionEntitlement");
}

const LEAD = { id: "lead-1", promotionId: "promo-1", onboardingApplicationId: "app-1" };
const PROMOTION = {
  id: "promo-1",
  active: true,
  durationMonths: 6,
  normalMonthlyAmountCents: 1000,
  promotionWaivesPlatformFee: true,
  promotionWaivesInvoiceMonthlyFee: false,
  promotionWaivesInvoiceUsageFee: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation((fn: any) => fn(mockPrisma));
  mockPrisma.$queryRaw.mockResolvedValue([{ locked: true }]);
  mockPrisma.promotionLead.findFirst.mockResolvedValue(LEAD);
  mockPrisma.promotion.findUnique.mockResolvedValue(PROMOTION);
  mockPrisma.promotionEntitlement.findFirst.mockResolvedValue(null);
  mockPrisma.promotionEntitlement.create.mockResolvedValue({ id: "ent-1", promotionId: "promo-1" });
});

describe("attachPromotionEntitlementIfLeadExists", () => {
  it("returns null when the application has no attributed lead", async () => {
    mockPrisma.promotionLead.findFirst.mockResolvedValue(null);
    const { attachPromotionEntitlementIfLeadExists } = await load();
    const result = await attachPromotionEntitlementIfLeadExists("app-1", "church-1");
    expect(result).toBeNull();
    expect(mockPrisma.promotionEntitlement.create).not.toHaveBeenCalled();
  });

  it("creates exactly one entitlement for a lead with no existing entitlement", async () => {
    const { attachPromotionEntitlementIfLeadExists } = await load();
    const result = await attachPromotionEntitlementIfLeadExists("app-1", "church-1");

    expect(mockPrisma.promotionEntitlement.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.promotionEntitlement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ originalLeadId: "lead-1", organizationId: "church-1" }) })
    );
    expect(result).toEqual({ entitlementId: "ent-1", promotionId: "promo-1" });
  });

  it("returns the existing entitlement instead of creating a second one when a row already exists", async () => {
    mockPrisma.promotionEntitlement.findFirst.mockResolvedValue({ id: "ent-existing", promotionId: "promo-1" });
    const { attachPromotionEntitlementIfLeadExists } = await load();
    const result = await attachPromotionEntitlementIfLeadExists("app-1", "church-1");

    expect(mockPrisma.promotionEntitlement.create).not.toHaveBeenCalled();
    expect(result).toEqual({ entitlementId: "ent-existing", promotionId: "promo-1" });
  });

  it("does not create a duplicate entitlement when it loses the advisory-lock race — the exact bug class confirmed in production for dashboard-access emails: two Finix events for the same merchant landing milliseconds apart", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ locked: false }]);
    const { attachPromotionEntitlementIfLeadExists } = await load();
    const result = await attachPromotionEntitlementIfLeadExists("app-1", "church-1");

    expect(mockPrisma.promotionEntitlement.create).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("returns the winner's row when the loser's own read finds it already committed, even without holding the lock", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ locked: false }]);
    mockPrisma.promotionEntitlement.findFirst.mockResolvedValue({ id: "ent-from-winner", promotionId: "promo-1" });
    const { attachPromotionEntitlementIfLeadExists } = await load();
    const result = await attachPromotionEntitlementIfLeadExists("app-1", "church-1");

    expect(mockPrisma.promotionEntitlement.create).not.toHaveBeenCalled();
    expect(result).toEqual({ entitlementId: "ent-from-winner", promotionId: "promo-1" });
  });

  it("returns null for an inactive promotion without ever attempting to create an entitlement", async () => {
    mockPrisma.promotion.findUnique.mockResolvedValue({ ...PROMOTION, active: false });
    const { attachPromotionEntitlementIfLeadExists } = await load();
    const result = await attachPromotionEntitlementIfLeadExists("app-1", "church-1");

    expect(result).toBeNull();
    expect(mockPrisma.promotionEntitlement.create).not.toHaveBeenCalled();
  });
});
