import { describe, it, expect } from "vitest";
import { deriveFundingSpeedFromOperationKey, formatFundingSpeed } from "@/lib/depositColumns";

describe("deriveFundingSpeedFromOperationKey", () => {
  it("returns STANDARD for the real captured payload's operation_key", () => {
    expect(deriveFundingSpeedFromOperationKey("STANDARD_MERCHANT_FUNDING_PUSH_TO_ACH")).toBe("STANDARD");
  });

  it("returns INSTANT for an instant funding operation_key", () => {
    expect(deriveFundingSpeedFromOperationKey("INSTANT_MERCHANT_FUNDING_PUSH_TO_ACH")).toBe("INSTANT");
  });

  it("checks SAME_DAY before the broader INSTANT/STANDARD match", () => {
    expect(deriveFundingSpeedFromOperationKey("STANDARD_MERCHANT_FUNDING_SAME_DAY_ACH")).toBe("SAME_DAY");
  });

  it("returns null (never guesses) for an unrelated operation_key", () => {
    expect(deriveFundingSpeedFromOperationKey("CARD_PRESENT_SALE")).toBeNull();
  });

  it("returns null for missing input", () => {
    expect(deriveFundingSpeedFromOperationKey(null)).toBeNull();
    expect(deriveFundingSpeedFromOperationKey(undefined)).toBeNull();
  });
});

describe("formatFundingSpeed", () => {
  it("title-cases a derived STANDARD value", () => {
    expect(formatFundingSpeed("STANDARD")).toBe("Standard");
  });

  it("title-cases a derived INSTANT value even though it has no dedicated label entry", () => {
    expect(formatFundingSpeed("INSTANT")).toBe("Instant");
  });

  it("returns an em dash for null", () => {
    expect(formatFundingSpeed(null)).toBe("—");
  });
});
