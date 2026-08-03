import { describe, it, expect } from "vitest";
import { validateClassification, calculateCharitablePortionForPayment } from "../invoiceClassification";

describe("validateClassification", () => {
  it("GOODS_OR_SERVICES has no extra requirements", () => {
    const result = validateClassification({
      classification: "GOODS_OR_SERVICES",
      totalCents: 1000,
      noGoodsOrServicesConfirmed: false,
      goodsServicesValueCents: null,
      charitablePortionCents: null,
    });
    expect(result.valid).toBe(true);
  });

  it("CHARITABLE_DONATION requires noGoodsOrServicesConfirmed", () => {
    const result = validateClassification({
      classification: "CHARITABLE_DONATION",
      totalCents: 1000,
      noGoodsOrServicesConfirmed: false,
      goodsServicesValueCents: null,
      charitablePortionCents: null,
    });
    expect(result.valid).toBe(false);
  });

  it("CHARITABLE_DONATION passes once confirmed", () => {
    const result = validateClassification({
      classification: "CHARITABLE_DONATION",
      totalCents: 1000,
      noGoodsOrServicesConfirmed: true,
      goodsServicesValueCents: null,
      charitablePortionCents: null,
    });
    expect(result.valid).toBe(true);
  });

  it("PARTIAL_DONATION requires both goodsServicesValueCents and charitablePortionCents", () => {
    const result = validateClassification({
      classification: "PARTIAL_DONATION",
      totalCents: 1000,
      noGoodsOrServicesConfirmed: false,
      goodsServicesValueCents: null,
      charitablePortionCents: 500,
    });
    expect(result.valid).toBe(false);
  });

  it("PARTIAL_DONATION requires the two portions to sum exactly to the total", () => {
    const result = validateClassification({
      classification: "PARTIAL_DONATION",
      totalCents: 1000,
      noGoodsOrServicesConfirmed: false,
      goodsServicesValueCents: 300,
      charitablePortionCents: 600,
    });
    expect(result.valid).toBe(false);
  });

  it("PARTIAL_DONATION passes when the portions sum correctly", () => {
    const result = validateClassification({
      classification: "PARTIAL_DONATION",
      totalCents: 1000,
      noGoodsOrServicesConfirmed: false,
      goodsServicesValueCents: 300,
      charitablePortionCents: 700,
    });
    expect(result.valid).toBe(true);
  });

  it("PARTIAL_DONATION rejects a negative portion", () => {
    const result = validateClassification({
      classification: "PARTIAL_DONATION",
      totalCents: 1000,
      noGoodsOrServicesConfirmed: false,
      goodsServicesValueCents: -100,
      charitablePortionCents: 1100,
    });
    expect(result.valid).toBe(false);
  });
});

describe("calculateCharitablePortionForPayment", () => {
  it("GOODS_OR_SERVICES never contributes to charitable totals", () => {
    const amount = calculateCharitablePortionForPayment({ classification: "GOODS_OR_SERVICES", totalCents: 1000, charitablePortionCents: null, paymentGrossCents: 1000 });
    expect(amount).toBe(0);
  });

  it("CHARITABLE_DONATION contributes the full payment amount", () => {
    const amount = calculateCharitablePortionForPayment({ classification: "CHARITABLE_DONATION", totalCents: 1000, charitablePortionCents: null, paymentGrossCents: 400 });
    expect(amount).toBe(400);
  });

  it("PARTIAL_DONATION contributes a proportional share on a partial payment", () => {
    const amount = calculateCharitablePortionForPayment({ classification: "PARTIAL_DONATION", totalCents: 10000, charitablePortionCents: 7000, paymentGrossCents: 5000 });
    expect(amount).toBe(3500);
  });

  it("PARTIAL_DONATION contributes the full charitable portion once the invoice is paid in full", () => {
    const amount = calculateCharitablePortionForPayment({ classification: "PARTIAL_DONATION", totalCents: 10000, charitablePortionCents: 7000, paymentGrossCents: 10000 });
    expect(amount).toBe(7000);
  });
});
