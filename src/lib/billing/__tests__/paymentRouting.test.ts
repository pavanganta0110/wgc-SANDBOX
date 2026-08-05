import { describe, it, expect, vi, beforeEach } from "vitest";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV, FINIX_WGC_BILLING_MERCHANT_ID: "MU_wgc_billing_123" };
});

async function loadModule(church: { finixMerchantId: string | null } | null) {
  const findUnique = vi.fn().mockResolvedValue(church);
  vi.doMock("@/lib/prisma", () => ({ prisma: { church: { findUnique } } }));
  const mod = await import("@/lib/billing/paymentRouting");
  return { mod, findUnique };
}

describe("resolveProcessingMerchant — WGC charge types always use WGC's billing merchant", () => {
  it("WGC_PLATFORM_SUBSCRIPTION resolves to the WGC billing merchant, not the organization's own merchant", async () => {
    const { mod, findUnique } = await loadModule({ finixMerchantId: "MU_some_church_999" });
    const resolved = await mod.resolveProcessingMerchant("WGC_PLATFORM_SUBSCRIPTION", "church-A");
    expect(resolved.merchantId).toBe("MU_wgc_billing_123");
    expect(resolved.isWgcBillingMerchant).toBe(true);
    // Must never even query the organization's own merchant for a WGC charge.
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("WGC_INVOICE_ADD_ON resolves to the WGC billing merchant", async () => {
    const { mod } = await loadModule(null);
    const resolved = await mod.resolveProcessingMerchant("WGC_INVOICE_ADD_ON", "church-A");
    expect(resolved.merchantId).toBe("MU_wgc_billing_123");
  });

  it("WGC_INVOICE_USAGE resolves to the WGC billing merchant", async () => {
    const { mod } = await loadModule(null);
    const resolved = await mod.resolveProcessingMerchant("WGC_INVOICE_USAGE", "church-A");
    expect(resolved.merchantId).toBe("MU_wgc_billing_123");
  });

  it("WGC_PLAN_UPGRADE resolves to the WGC billing merchant", async () => {
    const { mod } = await loadModule(null);
    const resolved = await mod.resolveProcessingMerchant("WGC_PLAN_UPGRADE", "church-A");
    expect(resolved.merchantId).toBe("MU_wgc_billing_123");
  });

  it("throws (fails closed) if FINIX_WGC_BILLING_MERCHANT_ID is unset, even for a WGC charge", async () => {
    delete process.env.FINIX_WGC_BILLING_MERCHANT_ID;
    const { mod } = await loadModule(null);
    await expect(mod.resolveProcessingMerchant("WGC_PLATFORM_SUBSCRIPTION", "church-A")).rejects.toThrow();
  });
});

describe("resolveProcessingMerchant — organization charge types always use the organization's own merchant", () => {
  it("MERCHANT_DONATION resolves to the organization's Church.finixMerchantId", async () => {
    const { mod } = await loadModule({ finixMerchantId: "MU_church_A_own" });
    const resolved = await mod.resolveProcessingMerchant("MERCHANT_DONATION", "church-A");
    expect(resolved.merchantId).toBe("MU_church_A_own");
    expect(resolved.isWgcBillingMerchant).toBe(false);
    // Must never resolve to WGC's own billing merchant.
    expect(resolved.merchantId).not.toBe("MU_wgc_billing_123");
  });

  it("MERCHANT_RECURRING_DONATION resolves to the organization's own merchant", async () => {
    const { mod } = await loadModule({ finixMerchantId: "MU_church_A_own" });
    const resolved = await mod.resolveProcessingMerchant("MERCHANT_RECURRING_DONATION", "church-A");
    expect(resolved.merchantId).toBe("MU_church_A_own");
  });

  it("MERCHANT_INVOICE_PAYMENT resolves to the organization's own merchant", async () => {
    const { mod } = await loadModule({ finixMerchantId: "MU_church_A_own" });
    const resolved = await mod.resolveProcessingMerchant("MERCHANT_INVOICE_PAYMENT", "church-A");
    expect(resolved.merchantId).toBe("MU_church_A_own");
  });

  it("MERCHANT_OTHER_PAYMENT resolves to the organization's own merchant", async () => {
    const { mod } = await loadModule({ finixMerchantId: "MU_church_A_own" });
    const resolved = await mod.resolveProcessingMerchant("MERCHANT_OTHER_PAYMENT", "church-A");
    expect(resolved.merchantId).toBe("MU_church_A_own");
  });

  it("throws when the organization has no approved Finix merchant on file", async () => {
    const { mod } = await loadModule({ finixMerchantId: null });
    await expect(mod.resolveProcessingMerchant("MERCHANT_DONATION", "church-A")).rejects.toThrow(/no approved Finix merchant/);
  });

  it("throws when the organization does not exist at all", async () => {
    const { mod } = await loadModule(null);
    await expect(mod.resolveProcessingMerchant("MERCHANT_DONATION", "church-A")).rejects.toThrow(/no approved Finix merchant/);
  });
});

describe("resolveProcessingMerchant — trusted organizationId only", () => {
  it("there is no merchantId parameter in the function signature at all — the browser has nothing to override", async () => {
    const { mod } = await loadModule({ finixMerchantId: "MU_church_A_own" });
    // TypeScript already enforces this at compile time (2-arg signature);
    // this assertion documents/locks the runtime arity too.
    expect(mod.resolveProcessingMerchant.length).toBe(2);
  });

  it("rejects an empty organizationId rather than resolving anything", async () => {
    const { mod } = await loadModule({ finixMerchantId: "MU_church_A_own" });
    await expect(mod.resolveProcessingMerchant("MERCHANT_DONATION", "")).rejects.toThrow();
  });
});

describe("assertMerchantMatches — cross-merchant mismatch protection (e.g. refunds)", () => {
  it("passes silently when the resolved merchant matches the expected one", async () => {
    const { mod } = await loadModule(null);
    const resolved = { chargeType: "MERCHANT_DONATION" as const, organizationId: "church-A", merchantId: "MU_church_A_own", isWgcBillingMerchant: false };
    expect(() => mod.assertMerchantMatches(resolved, "MU_church_A_own")).not.toThrow();
  });

  it("throws when a refund's original transaction merchant doesn't match what routing resolves today", async () => {
    const { mod } = await loadModule(null);
    const resolved = { chargeType: "MERCHANT_DONATION" as const, organizationId: "church-A", merchantId: "MU_church_A_new", isWgcBillingMerchant: false };
    expect(() => mod.assertMerchantMatches(resolved, "MU_church_A_OLD_STALE")).toThrow(/[Cc]ross-merchant mismatch/);
  });
});

describe("buildTrustedFinixTags", () => {
  it("includes only the whitelisted fields — never spreads arbitrary/PII data", async () => {
    const { mod } = await loadModule(null);
    const tags = mod.buildTrustedFinixTags({
      organizationId: "church-A",
      chargeType: "WGC_PLATFORM_SUBSCRIPTION",
      subscriptionId: "sub_123",
    });
    expect(tags).toEqual({
      wgc_organization_id: "church-A",
      wgc_charge_type: "WGC_PLATFORM_SUBSCRIPTION",
      wgc_environment: expect.any(String),
      wgc_subscription_id: "sub_123",
    });
    expect(Object.keys(tags).sort()).toEqual(
      ["wgc_charge_type", "wgc_environment", "wgc_organization_id", "wgc_subscription_id"].sort(),
    );
  });

  it("omits optional tags entirely when not provided, rather than including empty strings", async () => {
    const { mod } = await loadModule(null);
    const tags = mod.buildTrustedFinixTags({ organizationId: "church-A", chargeType: "MERCHANT_DONATION" });
    expect(tags.wgc_subscription_id).toBeUndefined();
    expect(tags.wgc_invoice_id).toBeUndefined();
    expect(tags.wgc_billing_charge_id).toBeUndefined();
  });
});

describe("buildIdempotencyKey", () => {
  it("joins trusted parts deterministically", async () => {
    const { mod } = await loadModule(null);
    expect(mod.buildIdempotencyKey("church-A", "WGC_PLATFORM_SUBSCRIPTION", "2027-02")).toBe(
      "church-A:WGC_PLATFORM_SUBSCRIPTION:2027-02",
    );
  });

  it("throws when given no meaningful parts", async () => {
    const { mod } = await loadModule(null);
    expect(() => mod.buildIdempotencyKey("", "  ")).toThrow();
  });
});
