import { prisma } from "@/lib/prisma";

// =========================================================================
// WGC Fee Matrix v3
//
// DONOR COVERS FEE:
//   Non-Amex card  →  3.00% of donation, no $0.30
//   American Expr  →  3.50% of donation, no $0.30
//   ACH            →  $0.25 flat
//
// ORG COVERS FEE:
//   Non-Amex card  →  2.30% + $0.30
//   American Expr  →  3.50% + $0.30
//   ACH            →  $0.25 flat
//
// supplemental_fee is sent ONLY when donorCoversFee === true.
// =========================================================================

export const FEE_CALCULATION_VERSION = "wgc_fee_matrix_v3";

// Legacy defaults kept for the old calculateFeeCoveredTotal path (not used
// when dynamicFeesEnabled, but preserved so callers don't break).
export const DEFAULT_CARD_PERCENTAGE_FEE = 2.9; // %
export const DEFAULT_CARD_FIXED_FEE_CENTS = 30;
export const DEFAULT_ACH_FIXED_FEE_CENTS = 25;

/**
 * Legacy gross-up helper — still used when dynamicFeesEnabled is false.
 * NOT used for the new fee matrix.
 */
export function calculateFeeCoveredTotal(
  donationCents: number,
  paymentMethod: "card" | "bank",
  rates: {
    cardPercentageFee?: number | null;
    cardFixedFeeCents?: number | null;
    achFixedFeeCents?: number | null;
  }
): { totalCents: number; feeCoveredCents: number } {
  if (paymentMethod === "bank") {
    const fixed = rates.achFixedFeeCents ?? DEFAULT_ACH_FIXED_FEE_CENTS;
    const totalCents = donationCents + fixed;
    return { totalCents, feeCoveredCents: totalCents - donationCents };
  }

  const pct = (rates.cardPercentageFee ?? DEFAULT_CARD_PERCENTAGE_FEE) / 100;
  const fixed = rates.cardFixedFeeCents ?? DEFAULT_CARD_FIXED_FEE_CENTS;
  const totalCents = Math.round((donationCents + fixed) / (1 - pct));
  return { totalCents, feeCoveredCents: totalCents - donationCents };
}

// =========================================================================
// Card brand normalizer
// =========================================================================

/**
 * Normalizes card brand strings to: VISA | MASTERCARD | AMERICAN_EXPRESS |
 * DISCOVER | UNKNOWN.
 *
 * Only American Express receives different treatment. Every other supported
 * card brand (Visa, Mastercard, Discover, and any unknown) uses non-Amex rates.
 */
export function normalizeCardBrand(brand: string | null | undefined): string {
  if (!brand) return "UNKNOWN";
  const b = brand.toUpperCase().trim().replace(/[\s_-]+/g, "_");
  if (b.includes("VISA")) return "VISA";
  if (b.includes("MASTERCARD") || b.includes("MASTER_CARD") || b === "MC") return "MASTERCARD";
  if (b.includes("AMEX") || b.includes("AMERICAN_EXPRESS") || b.includes("AMERICANEXPRESS")) return "AMERICAN_EXPRESS";
  if (b.includes("DISCOVER")) return "DISCOVER";
  return "UNKNOWN";
}

// =========================================================================
// Approved WGC Fee Matrix — canonical calculation function
// =========================================================================

export type FeeStrategyInput = {
  donationAmountCents: number;
  donorCoversFee: boolean;
  paymentMethod: "CARD" | "ACH";
  cardBrand?: string | null;
};

export type FeeStrategyResult = {
  feePaidBy: "DONOR" | "ORGANIZATION";
  /** cents to include as supplemental_fee in the Finix transfer payload.
   *  ZERO when donorCoversFee is false — supplemental_fee must NOT be sent. */
  supplementalFeeCents: number;
  expectedFeeCents: number;
  amountToChargeCents: number;
  percentageBasisPoints: number;
  fixedFeeCents: number;
};

export function calculateFeeStrategy(input: FeeStrategyInput): FeeStrategyResult {
  const { donationAmountCents, donorCoversFee, paymentMethod, cardBrand } = input;
  const isAch = paymentMethod === "ACH";
  const normalizedBrand = isAch ? "NONE" : normalizeCardBrand(cardBrand);
  const isAmex = normalizedBrand === "AMERICAN_EXPRESS";

  // ── ACH ────────────────────────────────────────────────────────────────
  if (isAch) {
    return {
      feePaidBy: donorCoversFee ? "DONOR" : "ORGANIZATION",
      supplementalFeeCents: donorCoversFee ? 25 : 0,
      expectedFeeCents: 25,
      amountToChargeCents: donorCoversFee ? donationAmountCents + 25 : donationAmountCents,
      percentageBasisPoints: 0,
      fixedFeeCents: 25,
    };
  }

  // ── Donor covers fee (card) ────────────────────────────────────────────
  if (donorCoversFee) {
    const percentageBasisPoints = isAmex ? 350 : 300;
    const feeCents = Math.round((donationAmountCents * percentageBasisPoints) / 10000);
    return {
      feePaidBy: "DONOR",
      supplementalFeeCents: feeCents,
      expectedFeeCents: feeCents,
      amountToChargeCents: donationAmountCents + feeCents,
      percentageBasisPoints,
      fixedFeeCents: 0,
    };
  }

  // ── Org covers fee (card) ──────────────────────────────────────────────
  const percentageBasisPoints = isAmex ? 350 : 230;
  const percentageFeeCents = Math.round((donationAmountCents * percentageBasisPoints) / 10000);
  const fixedFeeCents = 30;
  const feeCents = percentageFeeCents + fixedFeeCents;
  return {
    feePaidBy: "ORGANIZATION",
    supplementalFeeCents: 0, // NEVER send supplemental_fee on org-paid path
    expectedFeeCents: feeCents,
    amountToChargeCents: donationAmountCents,
    percentageBasisPoints,
    fixedFeeCents,
  };
}

// =========================================================================
// Legacy calculateDynamicSupplementalFee — now a thin wrapper around
// calculateFeeStrategy so existing call-sites continue to compile.
// =========================================================================

// Kept for legacy callers that still import CARD_FEE_CONFIG / PREMIUM_CARD_FIXED_FEE_CENTS.
// Not used internally for fee decisions any more.
export const PREMIUM_CARD_FIXED_FEE_CENTS = 0;
export const CARD_FEE_CONFIG = {
  VISA:              { percentageBps: 230, fixedFeeCents: 30 },
  DISCOVER:          { percentageBps: 230, fixedFeeCents: 30 },
  MASTERCARD:        { percentageBps: 230, fixedFeeCents: 30 },
  AMERICAN_EXPRESS:  { percentageBps: 350, fixedFeeCents: 30 },
  DEFAULT:           { percentageBps: 230, fixedFeeCents: 30 },
} as const;

export type FeeCalculationInput = {
  donationAmountCents: number;
  paymentMethod: "CARD" | "ACH";
  cardBrand?: string | null;
  donorCoversFee: boolean;
};

export type FeeCalculationResult = {
  donationAmountCents: number;
  processingFeeCents: number;
  donorChargeAmountCents: number;
  /** Zero when donorCoversFee is false — supplemental_fee must NOT be sent. */
  supplementalFeeCents: number;
  merchantExpectedNetCentsCents: number;
  merchantExpectedNetCents: number;
  percentageBps: number;
  fixedFeeCents: number;
  normalizedCardBrand: string;
};

/**
 * Server-side dynamic fee calculation using the approved WGC fee matrix.
 * All amounts are integer cents.
 */
export function calculateDynamicSupplementalFee(input: FeeCalculationInput): FeeCalculationResult {
  const { donationAmountCents, paymentMethod, cardBrand, donorCoversFee } = input;

  if (donationAmountCents < 0) {
    throw new Error("Donation amount cannot be negative");
  }

  const normalizedCardBrand = paymentMethod === "ACH" ? "" : normalizeCardBrand(cardBrand);

  const strategy = calculateFeeStrategy({
    donationAmountCents,
    donorCoversFee,
    paymentMethod,
    cardBrand,
  });

  const merchantExpectedNetCents = donationAmountCents - (donorCoversFee ? 0 : strategy.expectedFeeCents);

  return {
    donationAmountCents,
    processingFeeCents: strategy.expectedFeeCents,
    donorChargeAmountCents: strategy.amountToChargeCents,
    supplementalFeeCents: strategy.supplementalFeeCents, // 0 when org-paid
    merchantExpectedNetCentsCents: merchantExpectedNetCents,
    merchantExpectedNetCents,
    percentageBps: strategy.percentageBasisPoints,
    fixedFeeCents: strategy.fixedFeeCents,
    normalizedCardBrand,
  };
}

// =========================================================================
// Feature flag
// =========================================================================

/**
 * Checks if dynamic supplemental fees are enabled for the environment or merchant.
 */
export function isDynamicSupplementalFeesEnabled(merchantId: string | null | undefined): boolean {
  const flag = process.env.FINIX_DYNAMIC_SUPPLEMENTAL_FEES_ENABLED;
  if (!flag) return false;
  if (flag === "true") return true;
  if (flag === "sandbox" && process.env.FINIX_ENV === "sandbox") return true;
  if (merchantId) {
    const list = flag.split(",").map((m) => m.trim());
    if (list.includes(merchantId)) return true;
  }
  return false;
}

// =========================================================================
// Pricing warning check
// =========================================================================

/**
 * Server-side pricing check to warn when both dynamic supplemental fees
 * and a non-zero fee profile are active for a merchant.
 */
export async function checkPricingWarning(churchId: string, merchantId: string | null | undefined) {
  if (!merchantId) return;
  if (isDynamicSupplementalFeesEnabled(merchantId)) {
    const pricing = await prisma.churchPricing.findUnique({ where: { churchId } });
    if (pricing) {
      const hasNonZeroFees =
        (pricing.cardPercentageFee !== null && pricing.cardPercentageFee !== 0) ||
        (pricing.cardFixedFeeCents !== null && pricing.cardFixedFeeCents !== 0);
      if (hasNonZeroFees) {
        console.warn(
          `[PRICING_WARNING] Church ${churchId} / Merchant ${merchantId} is configured to use full dynamic supplemental fees, ` +
            `but its processing fee profile is non-zero (cardPercentageFee: ${pricing.cardPercentageFee}%, cardFixedFeeCents: ${pricing.cardFixedFeeCents}c). ` +
            `This could charge the merchant twice!`
        );
      }
    }
  }
}
