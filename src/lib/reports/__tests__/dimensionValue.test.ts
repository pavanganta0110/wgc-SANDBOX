import { describe, it, expect } from "vitest";
import { dimensionValue } from "@/lib/reports/insightsData";

describe("dimensionValue — cardBrand dimension", () => {
  it("labels a bank-account (ACH) instrument as ACH, not UNKNOWN", () => {
    expect(dimensionValue({ cardBrand: null, paymentMethodType: "BANK_ACCOUNT" }, "cardBrand")).toBe("ACH");
  });

  it("returns the real card brand for a card instrument", () => {
    expect(dimensionValue({ cardBrand: "VISA", paymentMethodType: "PAYMENT_CARD" }, "cardBrand")).toBe("VISA");
  });

  it("falls back to UNKNOWN only when the brand is genuinely unrecognized (a card with no brand captured)", () => {
    expect(dimensionValue({ cardBrand: null, paymentMethodType: "PAYMENT_CARD" }, "cardBrand")).toBe("UNKNOWN");
  });

  it("falls back to UNKNOWN when there's no instrument at all", () => {
    expect(dimensionValue(undefined, "cardBrand")).toBe("UNKNOWN");
  });
});
