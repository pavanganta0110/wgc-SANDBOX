import { describe, it, expect, vi, beforeEach } from "vitest";

function makePrismaMock() {
  const subscriptions = new Map<string, any>();
  subscriptions.set("old-1", {
    id: "old-1",
    finixSubscriptionId: "fx-old-1",
    donorId: "D1",
    finixPaymentInstrumentId: "IN1",
    givingLinkId: null,
    fundId: null,
    amountCents: 2500,
    billingInterval: "MONTHLY",
  });

  return {
    donor: { findFirst: vi.fn().mockResolvedValue({ id: "D1", name: "Jane Doe", email: "jane@example.com", anonymousPreference: false }) },
    finixPaymentInstrumentSnapshot: { findFirst: vi.fn().mockResolvedValue({ finixIdentityId: "ID1", cardLast4: "1111", bankLast4: null }) },
    church: { findUnique: vi.fn().mockResolvedValue({ finixMerchantId: "MU1", name: "Test Org" }) },
    finixSubscription: {
      update: vi.fn(async ({ where, data }: any) => ({ id: where.id, ...subscriptions.get(where.id), ...data })),
      create: vi.fn(async ({ data }: any) => ({ id: "new-1", ...data })),
    },
    subscriptionConsent: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(async (ops: any[]) => Promise.all(ops)),
  };
}

describe("recreateSubscriptionWithChange", () => {
  beforeEach(() => vi.resetModules());

  it("cancels the old Finix subscription and creates a new one with the changed amount, chained via supersedes", async () => {
    const prismaMock = makePrismaMock();
    const cancelSubscription = vi.fn().mockResolvedValue({});
    const createSubscription = vi.fn().mockResolvedValue({ id: "fx-new-1", state: "ACTIVE", next_billing_date: null });
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    vi.doMock("@/lib/finix/client", () => ({ finixClient: { cancelSubscription, createSubscription } }));
    vi.doMock("@/lib/finix/parseFinixDate", () => ({ parseFinixDate: () => null }));

    const { recreateSubscriptionWithChange } = await import("@/lib/subscriptions/subscriptionRecreate");
    const oldSub = { id: "old-1", finixSubscriptionId: "fx-old-1", donorId: "D1", finixPaymentInstrumentId: "IN1", givingLinkId: null, fundId: null, amountCents: 2500, billingInterval: "MONTHLY" };

    const result = await recreateSubscriptionWithChange({ churchId: "church-A", actorUserId: "user-1", oldSubscription: oldSub, newAmountCents: 5000 });

    expect(cancelSubscription).toHaveBeenCalledWith("fx-old-1");
    expect(createSubscription).toHaveBeenCalledWith(expect.objectContaining({ amount: 5000, billing_interval: "MONTHLY" }));
    expect(result.newSubscription.amountCents).toBe(5000);
    expect(result.newSubscription.supersedesSubscriptionId).toBe("old-1");
  });

  it("changes only the frequency when newBillingInterval is provided, leaving amount unchanged", async () => {
    const prismaMock = makePrismaMock();
    const cancelSubscription = vi.fn().mockResolvedValue({});
    const createSubscription = vi.fn().mockResolvedValue({ id: "fx-new-2", state: "ACTIVE", next_billing_date: null });
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    vi.doMock("@/lib/finix/client", () => ({ finixClient: { cancelSubscription, createSubscription } }));
    vi.doMock("@/lib/finix/parseFinixDate", () => ({ parseFinixDate: () => null }));

    const { recreateSubscriptionWithChange } = await import("@/lib/subscriptions/subscriptionRecreate");
    const oldSub = { id: "old-1", finixSubscriptionId: "fx-old-1", donorId: "D1", finixPaymentInstrumentId: "IN1", givingLinkId: null, fundId: null, amountCents: 2500, billingInterval: "MONTHLY" };

    const result = await recreateSubscriptionWithChange({ churchId: "church-A", actorUserId: "user-1", oldSubscription: oldSub, newBillingInterval: "YEARLY" });

    expect(createSubscription).toHaveBeenCalledWith(expect.objectContaining({ amount: 2500, billing_interval: "YEARLY" }));
    expect(result.newSubscription.billingInterval).toBe("YEARLY");
  });

  it("throws without calling Finix when the old subscription has no donor or instrument", async () => {
    const prismaMock = makePrismaMock();
    const cancelSubscription = vi.fn();
    const createSubscription = vi.fn();
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    vi.doMock("@/lib/finix/client", () => ({ finixClient: { cancelSubscription, createSubscription } }));
    vi.doMock("@/lib/finix/parseFinixDate", () => ({ parseFinixDate: () => null }));

    const { recreateSubscriptionWithChange } = await import("@/lib/subscriptions/subscriptionRecreate");
    const oldSub = { id: "old-1", finixSubscriptionId: "fx-old-1", donorId: null, finixPaymentInstrumentId: null, givingLinkId: null, fundId: null, amountCents: 2500, billingInterval: "MONTHLY" };

    await expect(recreateSubscriptionWithChange({ churchId: "church-A", actorUserId: "user-1", oldSubscription: oldSub, newAmountCents: 5000 })).rejects.toThrow();
    expect(cancelSubscription).not.toHaveBeenCalled();
  });
});
