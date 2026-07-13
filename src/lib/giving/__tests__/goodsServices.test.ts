import { describe, it, expect } from "vitest";
import { computeRecordedContributionAmountCents, validateGoodsServicesInput } from "@/lib/giving/goodsServices";

describe("computeRecordedContributionAmountCents", () => {
  it("subtracts fair market value from the payment amount", () => {
    expect(computeRecordedContributionAmountCents(10000, 3500)).toBe(6500);
  });

  it("returns the full payment amount when fair market value is zero", () => {
    expect(computeRecordedContributionAmountCents(10000, 0)).toBe(10000);
  });

  it("never goes negative even if fair market value exceeds the payment amount", () => {
    expect(computeRecordedContributionAmountCents(1000, 5000)).toBe(0);
  });

  it("handles integer-cent inputs exactly (no floating point drift)", () => {
    expect(computeRecordedContributionAmountCents(999, 333)).toBe(666);
  });
});

describe("validateGoodsServicesInput", () => {
  it("is valid with no fields set when nothing was provided", () => {
    const result = validateGoodsServicesInput({ provided: false, description: "", fairMarketValueCents: null }, 10000);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it("requires a description when goods/services were provided", () => {
    const result = validateGoodsServicesInput({ provided: true, description: "", fairMarketValueCents: 3500 }, 10000);
    expect(result.valid).toBe(false);
    expect(result.errors.description).toBeTruthy();
  });

  it("requires a fair market value when goods/services were provided", () => {
    const result = validateGoodsServicesInput({ provided: true, description: "Dinner", fairMarketValueCents: null }, 10000);
    expect(result.valid).toBe(false);
    expect(result.errors.fairMarketValueCents).toBeTruthy();
  });

  it("rejects a negative fair market value", () => {
    const result = validateGoodsServicesInput({ provided: true, description: "Dinner", fairMarketValueCents: -100 }, 10000);
    expect(result.valid).toBe(false);
    expect(result.errors.fairMarketValueCents).toBeTruthy();
  });

  it("rejects a non-integer fair market value", () => {
    const result = validateGoodsServicesInput({ provided: true, description: "Dinner", fairMarketValueCents: 100.5 }, 10000);
    expect(result.valid).toBe(false);
    expect(result.errors.fairMarketValueCents).toBeTruthy();
  });

  it("rejects a fair market value greater than the payment amount", () => {
    const result = validateGoodsServicesInput({ provided: true, description: "Dinner", fairMarketValueCents: 15000 }, 10000);
    expect(result.valid).toBe(false);
    expect(result.errors.fairMarketValueCents).toBeTruthy();
  });

  it("accepts a fair market value equal to the payment amount", () => {
    const result = validateGoodsServicesInput({ provided: true, description: "Dinner", fairMarketValueCents: 10000 }, 10000);
    expect(result.valid).toBe(true);
  });

  it("accepts a fair market value of zero when provided is true", () => {
    const result = validateGoodsServicesInput({ provided: true, description: "Recognition plaque", fairMarketValueCents: 0 }, 10000);
    expect(result.valid).toBe(true);
  });

  it("is valid with a well-formed description and fair market value", () => {
    const result = validateGoodsServicesInput({ provided: true, description: "Dinner ticket and event admission", fairMarketValueCents: 3500 }, 10000);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });
});
