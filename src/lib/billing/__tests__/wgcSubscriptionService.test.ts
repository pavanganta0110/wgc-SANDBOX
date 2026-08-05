import { describe, it, expect, vi, beforeEach } from "vitest";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV, FINIX_WGC_BILLING_MERCHANT_ID: "MU_wgc_billing_123" };
});

function makePrismaMock(overrides: Record<string, any> = {}) {
  const txMock = {
    wgcSubscription: { update: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: "sub-row-1", amountCents: 1000, currency: "USD", ...data })) },
    wgcBillingAccount: { update: vi.fn().mockResolvedValue({}) },
    church: { update: vi.fn().mockResolvedValue({}) },
    promotionEntitlement: { update: vi.fn().mockResolvedValue({}) },
  };
  return {
    wgcPricingVersion: {
      findFirst: vi.fn().mockResolvedValue({ id: "price-1", planCode: "WGC_STANDARD", planName: "WGC Platform", monthlyAmountCents: 1000, currency: "USD", billingInterval: "MONTHLY" }),
      create: vi.fn(),
    },
    wgcSubscription: {
      upsert: vi.fn().mockResolvedValue({
        id: "sub-row-1",
        organizationId: "church-A",
        finixSubscriptionId: null,
        status: "INCOMPLETE",
        trialStartsAt: null,
        trialEndsAt: null,
        firstChargeAt: null,
        nextChargeAt: null,
        amountCents: 1000,
        currency: "USD",
      }),
    },
    promotionEntitlement: { findFirst: vi.fn().mockResolvedValue(null) },
    wgcBillingAuditLog: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn().mockImplementation(async (cb: any) => cb(txMock)),
    __tx: txMock,
    ...overrides,
  };
}

async function loadModule(prismaMock: any, getMerchant = vi.fn().mockResolvedValue({ onboarding_state: "APPROVED" }), createSubscription?: any) {
  vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
  vi.doMock("@/lib/finix/client", () => ({ finixClient: { getMerchant, createSubscription: createSubscription ?? vi.fn() } }));
  return import("@/lib/billing/wgcSubscriptionService");
}

describe("activateWgcSubscription — trial configuration for a promotional organization", () => {
  it("creates a subscription with amount 1000 cents, a six-month trial, and stores Finix's returned first_charge_at", async () => {
    const prismaMock = makePrismaMock({
      promotionEntitlement: {
        findFirst: vi.fn().mockResolvedValue({ id: "ent-1", durationMonths: 6, status: "AWAITING_BILLING_SETUP" }),
        update: vi.fn().mockResolvedValue({}),
      },
    });
    const createSubscription = vi.fn().mockResolvedValue({
      id: "fx_sub_123",
      state: "TRIALING",
      trial_start: "2027-01-01T00:00:00Z",
      trial_end: "2027-07-01T00:00:00Z",
      first_charge_at: "2027-07-01T00:00:00Z",
      next_charge_date: "2027-07-01T00:00:00Z",
    });
    const mod = await loadModule(prismaMock, undefined, createSubscription);

    const result = await mod.activateWgcSubscription({
      organizationId: "church-A",
      billingIdentityId: "ID_buyer_1",
      billingPaymentInstrumentId: "PI_buyer_1",
    });

    expect(createSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1000,
        currency: "USD",
        billing_interval: "MONTHLY",
        linked_to: "MU_wgc_billing_123",
        linked_type: "MERCHANT",
        trial_details: expect.objectContaining({ trial_period_days: 180 }),
      }),
    );
    expect(result.isPromotional).toBe(true);
    expect(result.subscription.amountCents).toBe(1000);
    expect(result.subscription.firstChargeAt?.toISOString()).toBe("2027-07-01T00:00:00.000Z");
    expect(result.subscription.status).toBe("TRIALING");
  });

  it("a normal (non-promotional) organization gets no trial_details at all — the $10 charge is immediate/first-cycle", async () => {
    const prismaMock = makePrismaMock();
    const createSubscription = vi.fn().mockResolvedValue({ id: "fx_sub_456", state: "ACTIVE", next_charge_date: "2027-02-01T00:00:00Z" });
    const mod = await loadModule(prismaMock, undefined, createSubscription);

    const result = await mod.activateWgcSubscription({
      organizationId: "church-B",
      billingIdentityId: "ID_buyer_2",
      billingPaymentInstrumentId: "PI_buyer_2",
    });

    const callArgs = createSubscription.mock.calls[0][0];
    expect(callArgs.trial_details).toBeUndefined();
    expect(result.isPromotional).toBe(false);
  });

  it("no platform charge is created during trial — Finix is asked to create a SUBSCRIPTION, never a one-off transfer/charge", async () => {
    const prismaMock = makePrismaMock({
      promotionEntitlement: { findFirst: vi.fn().mockResolvedValue({ id: "ent-1", durationMonths: 6, status: "AWAITING_BILLING_SETUP" }), update: vi.fn().mockResolvedValue({}) },
    });
    const createTransfer = vi.fn();
    const createSubscription = vi.fn().mockResolvedValue({ id: "fx_sub_789", state: "TRIALING" });
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    vi.doMock("@/lib/finix/client", () => ({ finixClient: { getMerchant: vi.fn().mockResolvedValue({ onboarding_state: "APPROVED" }), createSubscription, createTransfer } }));
    const mod = await import("@/lib/billing/wgcSubscriptionService");

    await mod.activateWgcSubscription({ organizationId: "church-A", billingIdentityId: "ID_1", billingPaymentInstrumentId: "PI_1" });

    expect(createTransfer).not.toHaveBeenCalled();
  });
});

describe("activateWgcSubscription — duplicate-activation protection", () => {
  it("a second activation attempt reuses the existing subscription instead of calling Finix again", async () => {
    const prismaMock = makePrismaMock({
      wgcSubscription: {
        upsert: vi.fn().mockResolvedValue({
          id: "sub-row-1",
          organizationId: "church-A",
          finixSubscriptionId: "fx_sub_already_created",
          status: "TRIALING",
          trialStartsAt: new Date("2027-01-01"),
          trialEndsAt: new Date("2027-07-01"),
          firstChargeAt: new Date("2027-07-01"),
          nextChargeAt: new Date("2027-07-01"),
          amountCents: 1000,
          currency: "USD",
        }),
      },
    });
    const createSubscription = vi.fn();
    const mod = await loadModule(prismaMock, undefined, createSubscription);

    const result = await mod.activateWgcSubscription({
      organizationId: "church-A",
      billingIdentityId: "ID_1",
      billingPaymentInstrumentId: "PI_1",
    });

    expect(createSubscription).not.toHaveBeenCalled();
    expect(result.alreadyExisted).toBe(true);
    expect(result.subscription.finixSubscriptionId).toBe("fx_sub_already_created");
  });
});

describe("activateWgcSubscription — fails closed without a ready WGC billing merchant", () => {
  it("throws before calling Finix's subscription endpoint if the WGC billing merchant isn't approved", async () => {
    const prismaMock = makePrismaMock();
    const createSubscription = vi.fn();
    const getMerchant = vi.fn().mockResolvedValue({ onboarding_state: "UNDER_REVIEW" });
    const mod = await loadModule(prismaMock, getMerchant, createSubscription);

    await expect(
      mod.activateWgcSubscription({ organizationId: "church-A", billingIdentityId: "ID_1", billingPaymentInstrumentId: "PI_1" }),
    ).rejects.toThrow();
    expect(createSubscription).not.toHaveBeenCalled();
  });
});
