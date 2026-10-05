import { describe, it, expect } from "vitest";
import {
  parseDefaultDonationType,
  validateDefaultDonationSettings,
  resolveInitialDonationState,
  type DefaultDonationSettingsInput,
  type InitialDonationStateParams,
} from "../defaultDonationSettings";

function settings(overrides: Partial<DefaultDonationSettingsInput> = {}): DefaultDonationSettingsInput {
  return {
    defaultDonationType: "RECURRING",
    defaultRecurringAmountCents: 5000,
    recurringEnabled: true,
    amountType: "VARIABLE",
    minAmountCents: null,
    maxAmountCents: null,
    suggestedAmountsCents: [2500, 5000, 10000],
    allowCustomAmount: true,
    ...overrides,
  };
}

function initial(overrides: Partial<InitialDonationStateParams> = {}): InitialDonationStateParams {
  return {
    recurringEnabled: true,
    allowedFrequencies: ["MONTHLY"],
    defaultDonationType: "RECURRING",
    defaultRecurringAmountCents: 5000,
    amountType: "VARIABLE",
    fixedAmountCents: null,
    minAmountCents: null,
    maxAmountCents: null,
    suggestedAmountsCents: [2500, 5000, 10000],
    allowCustomAmount: true,
    ...overrides,
  };
}

describe("parseDefaultDonationType", () => {
  it("only RECURRING is recurring — everything else (incl. missing, from every existing row) is ONE_TIME", () => {
    expect(parseDefaultDonationType("RECURRING")).toBe("RECURRING");
    expect(parseDefaultDonationType("ONE_TIME")).toBe("ONE_TIME");
    expect(parseDefaultDonationType(undefined)).toBe("ONE_TIME");
    expect(parseDefaultDonationType(null)).toBe("ONE_TIME");
    expect(parseDefaultDonationType("recurring")).toBe("ONE_TIME");
  });
});

describe("validateDefaultDonationSettings", () => {
  it("accepts Recurring + $50 on a form with recurring enabled", () => {
    expect(validateDefaultDonationSettings(settings())).toEqual({ ok: true, value: { defaultDonationType: "RECURRING", defaultRecurringAmountCents: 5000 } });
  });

  it("treats no input at all as ONE_TIME with no amount (an unchanged existing form)", () => {
    expect(validateDefaultDonationSettings(settings({ defaultDonationType: undefined, defaultRecurringAmountCents: undefined }))).toEqual({
      ok: true,
      value: { defaultDonationType: "ONE_TIME", defaultRecurringAmountCents: null },
    });
  });

  it("rejects an unrecognized donation type", () => {
    const r = validateDefaultDonationSettings(settings({ defaultDonationType: "MONTHLY" }));
    expect(r.ok).toBe(false);
  });

  it("rejects Recurring as the default when recurring giving is turned off", () => {
    const r = validateDefaultDonationSettings(settings({ recurringEnabled: false }));
    expect(r).toEqual({ ok: false, error: expect.stringContaining("Allow recurring giving") });
  });

  it("allows ONE_TIME when recurring is off, and drops any amount", () => {
    expect(validateDefaultDonationSettings(settings({ defaultDonationType: "ONE_TIME", recurringEnabled: false }))).toEqual({
      ok: true,
      value: { defaultDonationType: "ONE_TIME", defaultRecurringAmountCents: null },
    });
  });

  it("drops the amount when One-Time is the default (it only applies to Recurring)", () => {
    const r = validateDefaultDonationSettings(settings({ defaultDonationType: "ONE_TIME" }));
    expect(r).toEqual({ ok: true, value: { defaultDonationType: "ONE_TIME", defaultRecurringAmountCents: null } });
  });

  it("drops the amount (rather than rejecting) on a FIXED or FIXED_QUANTITY form", () => {
    for (const amountType of ["FIXED", "FIXED_QUANTITY"] as const) {
      expect(validateDefaultDonationSettings(settings({ amountType }))).toEqual({
        ok: true,
        value: { defaultDonationType: "RECURRING", defaultRecurringAmountCents: null },
      });
    }
  });

  it("allows Recurring with no default amount", () => {
    expect(validateDefaultDonationSettings(settings({ defaultRecurringAmountCents: null }))).toEqual({
      ok: true,
      value: { defaultDonationType: "RECURRING", defaultRecurringAmountCents: null },
    });
  });

  it.each([[50], [99], [-100], [1.5], ["50"], [Number.NaN]])("rejects an invalid amount %s", (amount) => {
    expect(validateDefaultDonationSettings(settings({ defaultRecurringAmountCents: amount as never })).ok).toBe(false);
  });

  it("enforces the form's min and max", () => {
    expect(validateDefaultDonationSettings(settings({ minAmountCents: 6000 })).ok).toBe(false);
    expect(validateDefaultDonationSettings(settings({ maxAmountCents: 4000 })).ok).toBe(false);
    expect(validateDefaultDonationSettings(settings({ minAmountCents: 5000, maxAmountCents: 5000 })).ok).toBe(true);
  });

  it("with custom amounts off, requires the amount to be one of the suggested amounts", () => {
    expect(validateDefaultDonationSettings(settings({ allowCustomAmount: false, defaultRecurringAmountCents: 7500 })).ok).toBe(false);
    expect(validateDefaultDonationSettings(settings({ allowCustomAmount: false, defaultRecurringAmountCents: 5000 })).ok).toBe(true);
  });

  it("with custom amounts on, accepts an amount that isn't a suggested one", () => {
    expect(validateDefaultDonationSettings(settings({ defaultRecurringAmountCents: 7500 })).ok).toBe(true);
  });
});

describe("resolveInitialDonationState", () => {
  it("existing forms (no defaults set) open exactly as before: One-Time, first suggested amount", () => {
    expect(resolveInitialDonationState(initial({ defaultDonationType: undefined, defaultRecurringAmountCents: null }))).toEqual({
      isRecurring: false,
      amountCents: 2500,
      customAmount: "",
      appliedDefaultAmountCents: null,
    });
  });

  it("an explicit One-Time default with recurring on stays One-Time (and ignores any stored amount)", () => {
    const r = resolveInitialDonationState(initial({ defaultDonationType: "ONE_TIME" }));
    expect(r).toMatchObject({ isRecurring: false, amountCents: 2500, customAmount: "", appliedDefaultAmountCents: null });
  });

  it("Recurring + $50 opens Recurring with the $50 suggested button selected", () => {
    expect(resolveInitialDonationState(initial())).toEqual({ isRecurring: true, amountCents: 5000, customAmount: "", appliedDefaultAmountCents: 5000 });
  });

  it("a default amount that isn't a suggested one is entered as the custom amount", () => {
    expect(resolveInitialDonationState(initial({ defaultRecurringAmountCents: 7500 }))).toEqual({
      isRecurring: true,
      amountCents: 2500,
      customAmount: "75",
      appliedDefaultAmountCents: 7500,
    });
    expect(resolveInitialDonationState(initial({ defaultRecurringAmountCents: 7550 })).customAmount).toBe("75.50");
  });

  it("Recurring with no default amount opens Recurring on the normal starting amount", () => {
    expect(resolveInitialDonationState(initial({ defaultRecurringAmountCents: null }))).toEqual({
      isRecurring: true,
      amountCents: 2500,
      customAmount: "",
      appliedDefaultAmountCents: null,
    });
  });

  it("never opens Recurring when recurring giving is off, even if the row says RECURRING", () => {
    expect(resolveInitialDonationState(initial({ recurringEnabled: false }))).toMatchObject({ isRecurring: false, amountCents: 2500, appliedDefaultAmountCents: null });
  });

  it("never opens Recurring with no allowed frequency to offer", () => {
    expect(resolveInitialDonationState(initial({ allowedFrequencies: [] })).isRecurring).toBe(false);
  });

  it("does not pre-empt a fixed price: Recurring opens, but the amount stays the fixed price", () => {
    expect(resolveInitialDonationState(initial({ amountType: "FIXED", fixedAmountCents: 10000 }))).toEqual({
      isRecurring: true,
      amountCents: 10000,
      customAmount: "",
      appliedDefaultAmountCents: null,
    });
  });

  it("ignores a stale default amount that is now outside min/max", () => {
    expect(resolveInitialDonationState(initial({ minAmountCents: 6000 }))).toMatchObject({ amountCents: 2500, customAmount: "", appliedDefaultAmountCents: null });
    expect(resolveInitialDonationState(initial({ maxAmountCents: 4000 }))).toMatchObject({ amountCents: 2500, customAmount: "", appliedDefaultAmountCents: null });
  });

  it("ignores a stale non-suggested default when custom amounts have since been turned off", () => {
    expect(resolveInitialDonationState(initial({ defaultRecurringAmountCents: 7500, allowCustomAmount: false }))).toMatchObject({
      amountCents: 2500,
      customAmount: "",
      appliedDefaultAmountCents: null,
    });
  });
});
