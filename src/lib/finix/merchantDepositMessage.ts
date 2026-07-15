/**
 * State-aware copy for the "Linked Deposit" section of a settlement's
 * detail view — replaces the old one-size-fits-all "No bank deposit has
 * been sent for this settlement yet." with a message that reflects what's
 * actually known. `hasFundingTransferData` distinguishes "we asked Finix
 * and it genuinely has no funding transfer for this settlement yet" from
 * "we haven't been able to check" (e.g. the live refresh failed) — the
 * former is the only case that should say "No funding transfer has been
 * created yet."
 */
export type MerchantDepositMessageKey =
  | "NO_FUNDING_TRANSFER"
  | "PENDING"
  | "PROCESSING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELED"
  | "UNAVAILABLE";

const MESSAGES: Record<MerchantDepositMessageKey, string> = {
  NO_FUNDING_TRANSFER: "No funding transfer has been created yet.",
  PENDING: "Payout is pending.",
  PROCESSING: "Payout is processing.",
  SUCCEEDED: "Deposit succeeded.",
  FAILED: "Deposit failed.",
  CANCELED: "Deposit canceled.",
  UNAVAILABLE: "We couldn't check the latest deposit status. Please try again shortly.",
};

const SUCCEEDED_STATES = new Set(["SUCCEEDED", "COMPLETED", "PAID", "SETTLED", "ARRIVED"]);
const FAILED_STATES = new Set(["FAILED", "RETURNED", "REJECTED"]);
const CANCELED_STATES = new Set(["CANCELED", "CANCELLED", "VOIDED"]);
const PROCESSING_STATES = new Set(["PROCESSING", "IN_TRANSIT", "SENT"]);

export function resolveMerchantDepositMessageKey(depositState: string | null | undefined, hasFundingTransferData: boolean): MerchantDepositMessageKey {
  if (!depositState) {
    return hasFundingTransferData ? "NO_FUNDING_TRANSFER" : "UNAVAILABLE";
  }
  const state = depositState.toUpperCase();
  if (SUCCEEDED_STATES.has(state)) return "SUCCEEDED";
  if (FAILED_STATES.has(state)) return "FAILED";
  if (CANCELED_STATES.has(state)) return "CANCELED";
  if (PROCESSING_STATES.has(state)) return "PROCESSING";
  return "PENDING";
}

export function resolveMerchantDepositMessage(depositState: string | null | undefined, hasFundingTransferData: boolean): string {
  return MESSAGES[resolveMerchantDepositMessageKey(depositState, hasFundingTransferData)];
}
