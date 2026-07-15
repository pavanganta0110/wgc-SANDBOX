import { describe, it, expect } from "vitest";
import { mapFeeType } from "@/lib/fees/feeTypeLabels";

describe("mapFeeType", () => {
  it("maps a supplemental fee type without claiming who receives it", () => {
    const mapped = mapFeeType("supplemental_fee");
    expect(mapped.label).toBe("Supplemental Fee");
    expect(mapped.description).not.toMatch(/donor|WGC|organization receives/i);
  });

  it("maps ACH, card percentage, and card fixed fee types distinctly", () => {
    expect(mapFeeType("ach_fee").label).toBe("ACH Fee");
    expect(mapFeeType("card_percentage_rate").label).toBe("Card Percentage Fee");
    expect(mapFeeType("card_fixed_flat").label).toBe("Card Fixed Fee");
  });

  it("maps recurring/subscription fee types to Recurring Fee, distinct from platform fee", () => {
    expect(mapFeeType("recurring_service_fee").label).toBe("Recurring Fee");
    expect(mapFeeType("subscription_fee").label).toBe("Recurring Fee");
    expect(mapFeeType("platform_fee").label).toBe("Platform Fee");
  });

  it("falls back to a title-cased raw label for unrecognized types, never fabricating a category", () => {
    const mapped = mapFeeType("some_new_finix_fee_type");
    expect(mapped.label).toBe("Some New Finix Fee Type");
    expect(mapped.description).toMatch(/not yet mapped/i);
  });

  it("handles a null/empty fee type safely", () => {
    expect(mapFeeType(null).label).toBe("Fee");
    expect(mapFeeType(undefined).label).toBe("Fee");
  });
});
