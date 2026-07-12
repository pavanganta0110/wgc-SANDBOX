export type BankAccountDisplayStatus =
  | "CURRENT"
  | "ACTIVE" // legacy alias for CURRENT/ACTIVE_FOR_FUTURE_PAYOUTS on older rows — kept for backward compatibility
  | "SUBMITTED"
  | "PENDING" // legacy alias for SUBMITTED
  | "VALIDATION_PENDING"
  | "VERIFYING" // legacy alias for VALIDATION_PENDING
  | "UNDER_REVIEW"
  | "VERIFIED"
  | "ACTIVE_FOR_FUTURE_PAYOUTS"
  | "REQUIRES_ACTION"
  | "REJECTED"
  | "FAILED"
  | "REPLACED"
  | "DISABLED"
  | "UNKNOWN";

const RECOGNIZED = new Set<string>([
  "CURRENT",
  "ACTIVE",
  "SUBMITTED",
  "PENDING",
  "VALIDATION_PENDING",
  "VERIFYING",
  "UNDER_REVIEW",
  "VERIFIED",
  "ACTIVE_FOR_FUTURE_PAYOUTS",
  "REQUIRES_ACTION",
  "REJECTED",
  "FAILED",
  "REPLACED",
  "DISABLED",
]);

/**
 * WGC-facing display status, kept separate from whatever raw processor
 * state a bank instrument reports — mirrors the pattern used throughout
 * this codebase (resolveSubscriptionDisplayStatus, resolveDonorDisplayStatus,
 * etc.) of never trusting a raw processor string directly in the UI.
 */
export function resolveBankAccountDisplayStatus(row: {
  status?: string | null;
  isActiveDestination: boolean;
  processorState?: string | null;
}): BankAccountDisplayStatus {
  const explicit = (row.status || "").toUpperCase();
  if (RECOGNIZED.has(explicit)) return explicit as BankAccountDisplayStatus;
  if (row.isActiveDestination) return "ACTIVE_FOR_FUTURE_PAYOUTS";
  return "UNKNOWN";
}

/**
 * Given the account's current local status and a fresh instrument snapshot
 * from Finix (enabled / disabled_code), computes the next honest local
 * status. This can only ever advance as far as VERIFIED — it never sets
 * ACTIVE_FOR_FUTURE_PAYOUTS itself, because there is no confirmed signal in
 * this codebase that an instrument being "enabled" also means Finix has
 * made it the seller's active payout destination (see
 * PROCESSOR_PERMISSION_REQUIRED handling in payoutAccountReconciliation.ts).
 */
export function advancePayoutAccountStatus(
  currentStatus: string | null | undefined,
  instrument: { enabled?: boolean; disabled_code?: string | null }
): BankAccountDisplayStatus {
  const current = resolveBankAccountDisplayStatus({ status: currentStatus, isActiveDestination: false });
  if (current === "ACTIVE_FOR_FUTURE_PAYOUTS" || current === "REPLACED" || current === "REJECTED" || current === "FAILED") {
    return current; // terminal — reconciliation should have already stopped polling
  }
  if (instrument.disabled_code === "DELETED" || instrument.disabled_code === "REJECTED") {
    return "REJECTED";
  }
  if (instrument.enabled === false && instrument.disabled_code) {
    return "REQUIRES_ACTION";
  }
  if (instrument.enabled === true) {
    return "VERIFIED";
  }
  // Instrument exists but not yet enabled and no disabled_code — still
  // being reviewed by the processor.
  return current === "SUBMITTED" || current === "PENDING" ? "VALIDATION_PENDING" : "UNDER_REVIEW";
}
