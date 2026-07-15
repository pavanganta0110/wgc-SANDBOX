export const WGC_PRICING = {
  donorCovered: {
    nonAmexCardBasisPoints: 300,
    amexCardBasisPoints: 350,
    achFixedFeeCents: 25,
  },
  organizationPaid: {
    nonAmexCardBasisPoints: 230,
    amexCardBasisPoints: 350,
    cardFixedFeeCents: 25,
    achFixedFeeCents: 25,
  },
} as const;

export const FEE_CALCULATION_VERSION = "wgc_fee_matrix_v3";

export function normalizeCardBrand(brand: string | null | undefined): string {
  if (!brand) return "UNKNOWN";
  const b = brand.toUpperCase().trim().replace(/[\s_-]+/g, "_");
  if (b.includes("VISA")) return "VISA";
  if (b.includes("MASTERCARD") || b.includes("MASTER_CARD") || b === "MC") return "MASTERCARD";
  if (b.includes("AMEX") || b.includes("AMERICAN_EXPRESS") || b.includes("AMERICANEXPRESS")) return "AMERICAN_EXPRESS";
  if (b.includes("DISCOVER")) return "DISCOVER";
  return "UNKNOWN";
}

export type FeeCalculationInput = {
  donationAmountCents: number;
  paymentMethod: "CARD" | "ACH";
  cardBrand?: string | null;
  donorCoversFee: boolean;
};

export type FeeCalculationResult = {
  feePaidBy: "DONOR" | "ORGANIZATION";
  amountToChargeCents: number;
  expectedFeeCents: number;
  supplementalFeeCents: number;
  percentageBasisPoints: number;
  fixedFeeCents: number;
  normalizedCardBrand: string;
};

/**
 * Pure function. Safe for frontend previews and backend payload generation.
 * Follows the WGC Pricing Matrix exactly.
 */
export function calculateWgcFeeAmounts(input: FeeCalculationInput): FeeCalculationResult {
  const { donationAmountCents, donorCoversFee, paymentMethod, cardBrand } = input;
  const isAch = paymentMethod === "ACH";
  const normalizedCardBrand = isAch ? "NONE" : normalizeCardBrand(cardBrand);
  const isAmex = normalizedCardBrand === "AMERICAN_EXPRESS";

  if (isAch) {
    if (donorCoversFee) {
      return {
        feePaidBy: "DONOR",
        amountToChargeCents: donationAmountCents + WGC_PRICING.donorCovered.achFixedFeeCents,
        expectedFeeCents: WGC_PRICING.donorCovered.achFixedFeeCents,
        supplementalFeeCents: WGC_PRICING.donorCovered.achFixedFeeCents,
        percentageBasisPoints: 0,
        fixedFeeCents: WGC_PRICING.donorCovered.achFixedFeeCents,
        normalizedCardBrand,
      };
    } else {
      return {
        feePaidBy: "ORGANIZATION",
        amountToChargeCents: donationAmountCents,
        expectedFeeCents: WGC_PRICING.organizationPaid.achFixedFeeCents,
        supplementalFeeCents: 0,
        percentageBasisPoints: 0,
        fixedFeeCents: WGC_PRICING.organizationPaid.achFixedFeeCents,
        normalizedCardBrand,
      };
    }
  }

  // Card
  if (donorCoversFee) {
    const percentageBasisPoints = isAmex ? WGC_PRICING.donorCovered.amexCardBasisPoints : WGC_PRICING.donorCovered.nonAmexCardBasisPoints;
    const feeCents = Math.round((donationAmountCents * percentageBasisPoints) / 10000);
    return {
      feePaidBy: "DONOR",
      amountToChargeCents: donationAmountCents + feeCents,
      expectedFeeCents: feeCents,
      supplementalFeeCents: feeCents,
      percentageBasisPoints,
      fixedFeeCents: 0,
      normalizedCardBrand,
    };
  } else {
    const percentageBasisPoints = isAmex ? WGC_PRICING.organizationPaid.amexCardBasisPoints : WGC_PRICING.organizationPaid.nonAmexCardBasisPoints;
    const percentageFeeCents = Math.round((donationAmountCents * percentageBasisPoints) / 10000);
    const fixedFeeCents = WGC_PRICING.organizationPaid.cardFixedFeeCents;
    const feeCents = percentageFeeCents + fixedFeeCents;
    return {
      feePaidBy: "ORGANIZATION",
      amountToChargeCents: donationAmountCents,
      expectedFeeCents: feeCents,
      supplementalFeeCents: 0,
      percentageBasisPoints,
      fixedFeeCents,
      normalizedCardBrand,
    };
  }
}
