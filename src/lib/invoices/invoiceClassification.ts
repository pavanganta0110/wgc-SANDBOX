/**
 * Payment classification rules — determines whether (and how much of) an
 * invoice's payments flow into charitable-giving totals and year-end
 * statements. WGC does not provide tax advice; this only controls WGC's
 * own internal accounting/reporting behavior, and every classification's
 * UI must disclose that plainly to the merchant.
 */

export type InvoiceClassification = "GOODS_OR_SERVICES" | "CHARITABLE_DONATION" | "PARTIAL_DONATION";

export interface ClassificationInput {
  classification: InvoiceClassification;
  totalCents: number;
  noGoodsOrServicesConfirmed: boolean;
  goodsServicesValueCents: number | null;
  charitablePortionCents: number | null;
}

export interface ClassificationValidationResult {
  valid: boolean;
  error?: string;
}

/** Validates a classification's required fields before an invoice can be
 * sent — called at send-time validation (see invoiceSendValidation.ts),
 * never silently defaulted. */
export function validateClassification(input: ClassificationInput): ClassificationValidationResult {
  if (input.classification === "CHARITABLE_DONATION") {
    if (!input.noGoodsOrServicesConfirmed) {
      return { valid: false, error: "You must confirm that no goods or services were provided in exchange for this donation before sending." };
    }
    return { valid: true };
  }

  if (input.classification === "PARTIAL_DONATION") {
    if (input.goodsServicesValueCents == null || input.charitablePortionCents == null) {
      return { valid: false, error: "Both the goods/services value and the charitable portion are required for a partial-donation invoice." };
    }
    if (input.goodsServicesValueCents < 0 || input.charitablePortionCents < 0) {
      return { valid: false, error: "Goods/services value and charitable portion must not be negative." };
    }
    if (input.goodsServicesValueCents + input.charitablePortionCents !== input.totalCents) {
      return { valid: false, error: "The goods/services value and charitable portion must add up to the invoice total." };
    }
    return { valid: true };
  }

  // GOODS_OR_SERVICES has no extra required fields.
  return { valid: true };
}

/** The amount (in cents) of a payment on this invoice that should flow into
 * charitable-giving totals / year-end statements, proportional to how much
 * of the invoice total that payment represents — so a partial payment on a
 * PARTIAL_DONATION invoice contributes only its proportional share of the
 * charitable portion, never the whole thing on the first dollar received. */
export function calculateCharitablePortionForPayment(params: {
  classification: InvoiceClassification;
  totalCents: number;
  charitablePortionCents: number | null;
  paymentGrossCents: number;
}): number {
  if (params.classification === "GOODS_OR_SERVICES") return 0;
  if (params.classification === "CHARITABLE_DONATION") return params.paymentGrossCents;
  // PARTIAL_DONATION: proportional share.
  if (!params.charitablePortionCents || params.totalCents <= 0) return 0;
  return Math.round((params.paymentGrossCents * params.charitablePortionCents) / params.totalCents);
}
