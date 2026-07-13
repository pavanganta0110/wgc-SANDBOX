/**
 * Shared (client + server) goods/services quid-pro-quo calculation and
 * validation for a single donation. Kept as pure functions with no
 * framework/DB imports so the same logic runs identically in the Take a
 * Payment form (pre-submit validation) and the API route (authoritative
 * server-side validation) — the client check is only a UX convenience, the
 * server always re-validates.
 */
export interface GoodsServicesInput {
  provided: boolean;
  description: string;
  fairMarketValueCents: number | null;
}

export interface GoodsServicesValidationResult {
  valid: boolean;
  errors: {
    description?: string;
    fairMarketValueCents?: string;
  };
}

/** recordedContributionAmount = paymentAmount - fairMarketValue. Never negative — validation prevents FMV from exceeding the payment amount, but this is clamped defensively. */
export function computeRecordedContributionAmountCents(paymentAmountCents: number, fairMarketValueCents: number): number {
  return Math.max(0, paymentAmountCents - fairMarketValueCents);
}

export function validateGoodsServicesInput(input: GoodsServicesInput, paymentAmountCents: number): GoodsServicesValidationResult {
  const errors: GoodsServicesValidationResult["errors"] = {};

  if (!input.provided) {
    return { valid: true, errors: {} };
  }

  if (!input.description || !input.description.trim()) {
    errors.description = "Description is required when goods or services were provided.";
  }

  if (input.fairMarketValueCents == null || Number.isNaN(input.fairMarketValueCents)) {
    errors.fairMarketValueCents = "Estimated fair market value is required.";
  } else if (!Number.isInteger(input.fairMarketValueCents) || input.fairMarketValueCents < 0) {
    errors.fairMarketValueCents = "Fair market value must be zero or greater.";
  } else if (input.fairMarketValueCents > paymentAmountCents) {
    errors.fairMarketValueCents = "Fair market value cannot exceed the payment amount.";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
