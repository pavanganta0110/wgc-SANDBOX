export type PayoutDestinationState =
  | "CURRENT"
  | "SUBMITTED"
  | "PENDING_VERIFICATION"
  | "UNDER_REVIEW"
  | "REQUIRES_ACTION"
  | "APPROVED"
  | "ACTIVE"
  | "REJECTED"
  | "DISABLED"
  | "HISTORICAL"
  | "UNKNOWN";

/** @deprecated use PayoutDestinationState — kept as an alias so existing imports keep compiling. */
export type BankAccountDisplayStatus = PayoutDestinationState;

export type VerificationState = "NOT_STARTED" | "PENDING" | "VERIFIED" | "REJECTED";
export type PaymentInstrumentState = "ENABLED" | "DISABLED" | "PENDING" | "UNKNOWN";

// Legacy status strings written by earlier iterations of this feature,
// mapped to their current equivalent so existing rows keep displaying
// correctly without a migration.
const LEGACY_ALIASES: Record<string, PayoutDestinationState> = {
  PENDING: "SUBMITTED",
  VERIFYING: "PENDING_VERIFICATION",
  VALIDATION_PENDING: "PENDING_VERIFICATION",
  VERIFIED: "APPROVED",
  ACTIVE_FOR_FUTURE_PAYOUTS: "ACTIVE",
  REPLACED: "HISTORICAL",
  FAILED: "REJECTED",
};

const CANONICAL = new Set<PayoutDestinationState>([
  "CURRENT",
  "SUBMITTED",
  "PENDING_VERIFICATION",
  "UNDER_REVIEW",
  "REQUIRES_ACTION",
  "APPROVED",
  "ACTIVE",
  "REJECTED",
  "DISABLED",
  "HISTORICAL",
]);

/**
 * WGC-facing payout-destination lifecycle state, kept separate from
 * verificationState and paymentInstrumentState (never conflated — see the
 * OrganizationBankAccount schema comment). Mirrors the pattern used
 * throughout this codebase (resolveSubscriptionDisplayStatus,
 * resolveDonorDisplayStatus, etc.) of never trusting a raw processor string
 * directly in the UI.
 */
export function resolveBankAccountDisplayStatus(row: {
  status?: string | null;
  isActiveDestination: boolean;
  paymentInstrumentState?: string | null;
}): PayoutDestinationState {
  const explicit = (row.status || "").toUpperCase();
  if (CANONICAL.has(explicit as PayoutDestinationState)) return explicit as PayoutDestinationState;
  if (explicit in LEGACY_ALIASES) return LEGACY_ALIASES[explicit];
  if (row.isActiveDestination) return "ACTIVE";
  return "UNKNOWN";
}

const TERMINAL_STATUSES = new Set<PayoutDestinationState>(["ACTIVE", "HISTORICAL", "REJECTED", "DISABLED"]);

export function isTerminalPayoutAccountStatus(status: string | null | undefined): boolean {
  return TERMINAL_STATUSES.has(resolveBankAccountDisplayStatus({ status, isActiveDestination: false }));
}

/**
 * Verification is Finix's judgment about the instrument itself — distinct
 * from payoutDestinationState, which is WGC's lifecycle label for the
 * change request. An instrument can be VERIFIED without being the active
 * payout destination (see isActivePayoutDestination) — this codebase must
 * never imply otherwise in copy.
 */
export function resolveVerificationState(instrument: { enabled?: boolean; disabled_code?: string | null }, payoutDestinationState: PayoutDestinationState): VerificationState {
  if (instrument.disabled_code === "DELETED" || instrument.disabled_code === "REJECTED") return "REJECTED";
  if (instrument.enabled === true) return "VERIFIED";
  if (payoutDestinationState === "SUBMITTED" || payoutDestinationState === "CURRENT") return "NOT_STARTED";
  return "PENDING";
}

export function resolvePaymentInstrumentState(instrument: { enabled?: boolean; disabled_code?: string | null }): PaymentInstrumentState {
  if (instrument.enabled === true) return "ENABLED";
  if (instrument.disabled_code) return "DISABLED";
  return "PENDING";
}

/**
 * Given the account's current local payoutDestinationState and a fresh
 * instrument snapshot from Finix (enabled / disabled_code), computes the
 * next honest local state. This can only ever advance as far as APPROVED —
 * it never sets ACTIVE itself, because there is no confirmed signal in this
 * codebase that an instrument being "enabled" also means Finix has made it
 * the seller's active payout destination (see
 * flagPayoutAccountVerifiedForActivationConfirmation in
 * payoutAccountReconciliation.ts). Approval/verification never implies
 * activation — those are deliberately separate fields.
 */
export function advancePayoutAccountStatus(
  currentStatus: string | null | undefined,
  instrument: { enabled?: boolean; disabled_code?: string | null }
): PayoutDestinationState {
  const current = resolveBankAccountDisplayStatus({ status: currentStatus, isActiveDestination: false });
  if (isTerminalPayoutAccountStatus(current)) {
    return current; // terminal — reconciliation should have already stopped polling
  }
  if (instrument.disabled_code === "DELETED" || instrument.disabled_code === "REJECTED") {
    return "REJECTED";
  }
  if (instrument.enabled === false && instrument.disabled_code) {
    return "REQUIRES_ACTION";
  }
  if (instrument.enabled === true) {
    return "APPROVED";
  }
  // Instrument exists but not yet enabled and no disabled_code — still
  // being reviewed by the processor.
  return current === "SUBMITTED" ? "PENDING_VERIFICATION" : "UNDER_REVIEW";
}
