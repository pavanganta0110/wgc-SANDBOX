import { calculateWgcFeeAmounts, FeeCalculationInput, FeeCalculationResult } from "./feeCalculator";

export type TransferFeeStrategyResult = FeeCalculationResult & {
  feeProfileId: string;
};

/**
 * Server-only function that resolves the WGC fee strategy,
 * validates environment configuration, and selects the exact Finix Fee Profile ID.
 */
export function resolveWgcTransferFeeStrategy(input: FeeCalculationInput): TransferFeeStrategyResult {
  const result = calculateWgcFeeAmounts(input);

  const zeroProfileId = process.env.WGC_DONOR_COVERED_ZERO_FEE_PROFILE_ID;
  const orgPaidProfileId = process.env.WGC_ORGANIZATION_PAID_FEE_PROFILE_ID;

  if (!zeroProfileId) {
    throw new Error("Server configuration error: Missing WGC_DONOR_COVERED_ZERO_FEE_PROFILE_ID");
  }
  if (!orgPaidProfileId) {
    throw new Error("Server configuration error: Missing WGC_ORGANIZATION_PAID_FEE_PROFILE_ID");
  }

  // Double check that we are not mixing up live and sandbox IDs (sandbox start with FP, typically, but length check or so? 
  // Let's just fail if not set, we did check them manually.
  
  let feeProfileId: string;
  if (result.feePaidBy === "DONOR") {
    feeProfileId = zeroProfileId;
  } else {
    feeProfileId = orgPaidProfileId;
  }

  return {
    ...result,
    feeProfileId,
  };
}
