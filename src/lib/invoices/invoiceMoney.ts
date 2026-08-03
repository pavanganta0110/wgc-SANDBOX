/**
 * Decimal-safe money calculations for invoices — integer cents throughout,
 * never floating-point. Matches this codebase's existing money convention
 * (see feeCalculator.ts: `Math.round((amountCents * bps) / 10000)` for
 * basis-point math). Every function here is pure and server-only; the
 * invoice builder UI mirrors these calculations for live preview but the
 * server always recomputes and is the only value ever persisted or charged.
 */

export interface LineItemInput {
  quantity: number;
  unitPriceCents: number;
  discountType: "FIXED" | "PERCENTAGE";
  /** Cents if discountType is FIXED, basis points (100 = 1%) if PERCENTAGE. */
  discountValue: number;
  taxRateBasisPoints: number | null;
}

export interface LineItemCalculated {
  grossCents: number;
  discountAppliedCents: number;
  taxAmountCents: number;
  totalCents: number;
}

/** A negative computed quantity/price is never trusted from client input —
 * callers must validate quantity >= 0 and unitPriceCents >= 0 before this
 * runs; this function does not silently clamp a negative input, it throws,
 * since a negative line item reaching here means validation was skipped. */
export function calculateLineItem(input: LineItemInput): LineItemCalculated {
  if (input.quantity < 0 || input.unitPriceCents < 0) {
    throw new Error("Line item quantity and unit price must be non-negative.");
  }
  const grossCents = Math.round(input.quantity * input.unitPriceCents);

  const discountAppliedCents =
    input.discountType === "PERCENTAGE"
      ? Math.round((grossCents * Math.max(0, input.discountValue)) / 10000)
      : Math.min(Math.max(0, input.discountValue), grossCents);

  const afterDiscountCents = grossCents - discountAppliedCents;
  const taxAmountCents = input.taxRateBasisPoints ? Math.round((afterDiscountCents * input.taxRateBasisPoints) / 10000) : 0;
  const totalCents = afterDiscountCents + taxAmountCents;

  return { grossCents, discountAppliedCents, taxAmountCents, totalCents };
}

export interface InvoiceTotalsInput {
  lineItems: LineItemCalculated[];
  /** Invoice-level discount, applied on top of (after) line-item discounts —
   * cents, always FIXED at this level (the builder doesn't expose an
   * invoice-level percentage option, matching the spec's line-item-level
   * discount-type toggle only). */
  invoiceLevelDiscountCents: number;
  serviceFeeCents: number;
}

export interface InvoiceTotals {
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  serviceFeeCents: number;
  totalCents: number;
}

/**
 * subtotalCents is the sum of line-item gross amounts (before any discount
 * or tax) — the "sticker price" total. discountCents is every line-item
 * discount plus the invoice-level discount, combined into one number for
 * display (each component is still visible per-line on the invoice itself).
 * taxCents is the sum of line-item tax. The invoice-level discount is
 * applied after tax is computed on line items (i.e. it doesn't reduce the
 * tax base) — a documented WGC choice, not a tax-compliance determination;
 * see the "WGC does not determine tax obligations" disclosure requirement.
 */
export function calculateInvoiceTotals(input: InvoiceTotalsInput): InvoiceTotals {
  const subtotalCents = input.lineItems.reduce((sum, li) => sum + li.grossCents, 0);
  const lineDiscountCents = input.lineItems.reduce((sum, li) => sum + li.discountAppliedCents, 0);
  const taxCents = input.lineItems.reduce((sum, li) => sum + li.taxAmountCents, 0);
  const invoiceLevelDiscountCents = Math.max(0, Math.min(input.invoiceLevelDiscountCents, subtotalCents - lineDiscountCents));
  const discountCents = lineDiscountCents + invoiceLevelDiscountCents;
  const serviceFeeCents = Math.max(0, input.serviceFeeCents);
  const totalCents = Math.max(0, subtotalCents - discountCents + taxCents + serviceFeeCents);

  return { subtotalCents, discountCents, taxCents, serviceFeeCents, totalCents };
}

/**
 * Recomputes amountPaidCents/refundedCents/balanceCents for an invoice from
 * its actual InvoicePayment ledger rows — never incremented/decremented in
 * place, always recomputed from the full set of SUCCEEDED (or
 * PARTIALLY_REFUNDED/REFUNDED) payments, so a missed event or out-of-order
 * webhook can never leave the balance permanently wrong. PENDING (ACH
 * clearing) payments are excluded from amountPaidCents — never treated as a
 * settled reduction of the balance until they reach SUCCEEDED, per the
 * mandatory "never mark pending ACH as finally settled prematurely" rule.
 */
export function calculateInvoiceBalance(params: {
  totalCents: number;
  payments: { status: string; netAmountCents: number; grossAmountCents: number; refundedCents: number }[];
}): { amountPaidCents: number; refundedCents: number; balanceCents: number } {
  let amountPaidCents = 0;
  let refundedCents = 0;

  for (const payment of params.payments) {
    if (payment.status !== "SUCCEEDED" && payment.status !== "PARTIALLY_REFUNDED" && payment.status !== "REFUNDED") continue;
    // The invoice balance is measured against the gross amount the payer
    // paid (what reduces their debt), not the merchant's net-of-processing-
    // fee amount — those are two different numbers tracked independently
    // (see InvoicePayment.processingFeeCents), never conflated here.
    amountPaidCents += payment.grossAmountCents - payment.refundedCents;
    refundedCents += payment.refundedCents;
  }

  const balanceCents = Math.max(0, params.totalCents - amountPaidCents);
  return { amountPaidCents, refundedCents, balanceCents };
}
