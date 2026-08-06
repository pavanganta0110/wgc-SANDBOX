import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("getWgcBillingMerchantId — fails closed", () => {
  it("throws when FINIX_WGC_BILLING_MERCHANT_ID is not set", async () => {
    delete process.env.FINIX_WGC_BILLING_MERCHANT_ID;
    const { getWgcBillingMerchantId, WgcBillingConfigError } = await import("@/lib/billing/wgcBillingConfig");
    expect(() => getWgcBillingMerchantId()).toThrow(WgcBillingConfigError);
  });

  it("returns the configured merchant id when set", async () => {
    process.env.FINIX_WGC_BILLING_MERCHANT_ID = "MU_wgc_billing_123";
    const { getWgcBillingMerchantId } = await import("@/lib/billing/wgcBillingConfig");
    expect(getWgcBillingMerchantId()).toBe("MU_wgc_billing_123");
  });
});

describe("assertFinixEnvironmentConsistent", () => {
  it("passes silently when FINIX_ENVIRONMENT is unset", async () => {
    delete process.env.FINIX_ENVIRONMENT;
    const { assertFinixEnvironmentConsistent } = await import("@/lib/billing/wgcBillingConfig");
    expect(() => assertFinixEnvironmentConsistent()).not.toThrow();
  });

  it("throws when FINIX_ENVIRONMENT=production but FINIX_BASE_URL is a sandbox URL", async () => {
    process.env.FINIX_ENVIRONMENT = "production";
    process.env.FINIX_BASE_URL = "https://api-sandbox.finix.com";
    const { assertFinixEnvironmentConsistent, WgcBillingConfigError } = await import("@/lib/billing/wgcBillingConfig");
    expect(() => assertFinixEnvironmentConsistent()).toThrow(WgcBillingConfigError);
  });

  it("passes when FINIX_ENVIRONMENT=production and FINIX_BASE_URL is a production URL", async () => {
    process.env.FINIX_ENVIRONMENT = "production";
    process.env.FINIX_BASE_URL = "https://api.finix.com";
    const { assertFinixEnvironmentConsistent } = await import("@/lib/billing/wgcBillingConfig");
    expect(() => assertFinixEnvironmentConsistent()).not.toThrow();
  });

  it("passes when FINIX_ENVIRONMENT=sandbox and FINIX_BASE_URL is a sandbox URL", async () => {
    process.env.FINIX_ENVIRONMENT = "sandbox";
    process.env.FINIX_BASE_URL = "https://api-sandbox.finix.com";
    const { assertFinixEnvironmentConsistent } = await import("@/lib/billing/wgcBillingConfig");
    expect(() => assertFinixEnvironmentConsistent()).not.toThrow();
  });
});

describe("assertWgcBillingMerchantReady", () => {
  it("resolves when Finix reports the merchant APPROVED", async () => {
    process.env.FINIX_WGC_BILLING_MERCHANT_ID = "MU_wgc_billing_123";
    const getMerchant = vi.fn().mockResolvedValue({ onboarding_state: "APPROVED", processing_enabled: true });
    vi.doMock("@/lib/finix/client", () => ({ finixClient: { getMerchant } }));

    const { assertWgcBillingMerchantReady } = await import("@/lib/billing/wgcBillingConfig");
    const result = await assertWgcBillingMerchantReady();

    expect(result.approved).toBe(true);
    expect(result.merchantId).toBe("MU_wgc_billing_123");
    expect(getMerchant).toHaveBeenCalledWith("MU_wgc_billing_123");
  });

  it("throws when Finix reports the merchant is not approved — never silently treated as ready", async () => {
    process.env.FINIX_WGC_BILLING_MERCHANT_ID = "MU_wgc_billing_123";
    const getMerchant = vi.fn().mockResolvedValue({ onboarding_state: "UNDER_REVIEW" });
    vi.doMock("@/lib/finix/client", () => ({ finixClient: { getMerchant } }));

    const { assertWgcBillingMerchantReady, WgcBillingConfigError } = await import("@/lib/billing/wgcBillingConfig");
    await expect(assertWgcBillingMerchantReady()).rejects.toThrow(WgcBillingConfigError);
  });

  it("throws (fails closed) when the Finix API call itself errors, never assumed approved", async () => {
    process.env.FINIX_WGC_BILLING_MERCHANT_ID = "MU_wgc_billing_123";
    const getMerchant = vi.fn().mockRejectedValue(new Error("network timeout"));
    vi.doMock("@/lib/finix/client", () => ({ finixClient: { getMerchant } }));

    const { assertWgcBillingMerchantReady, WgcBillingConfigError } = await import("@/lib/billing/wgcBillingConfig");
    await expect(assertWgcBillingMerchantReady()).rejects.toThrow(WgcBillingConfigError);
  });

  it("throws when FINIX_WGC_BILLING_MERCHANT_ID is missing, before ever calling Finix", async () => {
    delete process.env.FINIX_WGC_BILLING_MERCHANT_ID;
    const getMerchant = vi.fn();
    vi.doMock("@/lib/finix/client", () => ({ finixClient: { getMerchant } }));

    const { assertWgcBillingMerchantReady, WgcBillingConfigError } = await import("@/lib/billing/wgcBillingConfig");
    await expect(assertWgcBillingMerchantReady()).rejects.toThrow(WgcBillingConfigError);
    expect(getMerchant).not.toHaveBeenCalled();
  });
});
