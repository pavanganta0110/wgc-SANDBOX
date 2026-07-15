import { describe, it, expect } from "vitest";
import { resolveMerchantDepositMessage, resolveMerchantDepositMessageKey } from "@/lib/finix/merchantDepositMessage";

describe("resolveMerchantDepositMessageKey", () => {
  it("says no funding transfer only when Finix was actually checked and truly has none", () => {
    expect(resolveMerchantDepositMessageKey(null, true)).toBe("NO_FUNDING_TRANSFER");
  });

  it("does not claim 'no funding transfer' when the live check itself failed/was unavailable", () => {
    expect(resolveMerchantDepositMessageKey(null, false)).toBe("UNAVAILABLE");
  });

  it("maps the exact sandbox scenario: SUCCEEDED merchant deposit", () => {
    expect(resolveMerchantDepositMessageKey("SUCCEEDED", true)).toBe("SUCCEEDED");
  });

  it("maps COMPLETED/PAID/SETTLED/ARRIVED as succeeded synonyms", () => {
    expect(resolveMerchantDepositMessageKey("COMPLETED", true)).toBe("SUCCEEDED");
    expect(resolveMerchantDepositMessageKey("PAID", true)).toBe("SUCCEEDED");
    expect(resolveMerchantDepositMessageKey("SETTLED", true)).toBe("SUCCEEDED");
    expect(resolveMerchantDepositMessageKey("ARRIVED", true)).toBe("SUCCEEDED");
  });

  it("maps failed/returned/rejected as failed", () => {
    expect(resolveMerchantDepositMessageKey("FAILED", true)).toBe("FAILED");
    expect(resolveMerchantDepositMessageKey("RETURNED", true)).toBe("FAILED");
  });

  it("maps canceled/cancelled/voided as canceled", () => {
    expect(resolveMerchantDepositMessageKey("CANCELED", true)).toBe("CANCELED");
    expect(resolveMerchantDepositMessageKey("CANCELLED", true)).toBe("CANCELED");
  });

  it("maps processing/in_transit/sent as processing", () => {
    expect(resolveMerchantDepositMessageKey("PROCESSING", true)).toBe("PROCESSING");
    expect(resolveMerchantDepositMessageKey("IN_TRANSIT", true)).toBe("PROCESSING");
  });

  it("falls back to pending for any other real state", () => {
    expect(resolveMerchantDepositMessageKey("QUEUED", true)).toBe("PENDING");
  });

  it("is case-insensitive", () => {
    expect(resolveMerchantDepositMessageKey("succeeded", true)).toBe("SUCCEEDED");
  });
});

describe("resolveMerchantDepositMessage", () => {
  it("produces the exact required copy for each state-aware message", () => {
    expect(resolveMerchantDepositMessage(null, true)).toBe("No funding transfer has been created yet.");
    expect(resolveMerchantDepositMessage("PENDING", true)).toBe("Payout is pending.");
    expect(resolveMerchantDepositMessage("PROCESSING", true)).toBe("Payout is processing.");
    expect(resolveMerchantDepositMessage("SUCCEEDED", true)).toBe("Deposit succeeded.");
    expect(resolveMerchantDepositMessage("FAILED", true)).toBe("Deposit failed.");
    expect(resolveMerchantDepositMessage("CANCELED", true)).toBe("Deposit canceled.");
  });
});
