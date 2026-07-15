/**
 * WGC-only donor status, computed on read — never stored, so it can't drift
 * the way a stored status column would as new donations/subscriptions/
 * disputes arrive. Distinct from any processor identity state (Donor has
 * no processor "state" field at all today).
 */
export type DonorDisplayStatus = "ARCHIVED" | "AT_RISK" | "RECURRING" | "ACTIVE" | "INACTIVE";

export interface DonorStatusInput {
  archivedAt: Date | null;
  hasActiveSubscription: boolean;
  hasPastDueSubscription: boolean;
  hasRecentBankReturn: boolean;
  hasOpenDispute: boolean;
  hasRecentRepeatedFailures: boolean;
  hasDisabledPaymentMethodOnActiveSubscription: boolean;
  hasRecentSuccessfulDonation: boolean;
}

export function resolveDonorDisplayStatus(input: DonorStatusInput): DonorDisplayStatus {
  if (input.archivedAt) return "ARCHIVED";

  if (
    input.hasPastDueSubscription ||
    input.hasRecentBankReturn ||
    input.hasOpenDispute ||
    input.hasRecentRepeatedFailures ||
    input.hasDisabledPaymentMethodOnActiveSubscription
  ) {
    return "AT_RISK";
  }

  if (input.hasActiveSubscription) return "RECURRING";
  if (input.hasRecentSuccessfulDonation) return "ACTIVE";
  return "INACTIVE";
}

export const DONOR_DISPLAY_STATUS_LABELS: Record<DonorDisplayStatus, string> = {
  ARCHIVED: "Archived",
  AT_RISK: "At Risk",
  RECURRING: "Recurring",
  ACTIVE: "Active",
  INACTIVE: "Inactive",
};

/** "Recent" activity/risk window used for ACTIVE and the failure/return AT_RISK signals. */
export const DONOR_ACTIVITY_WINDOW_DAYS = 90;
/** Narrower window for "multiple recent failed payments" — a cluster of failures, not lifetime history. */
export const DONOR_REPEATED_FAILURE_WINDOW_DAYS = 30;
export const DONOR_REPEATED_FAILURE_THRESHOLD = 2;

export function resolveDonorNeedsAttentionReasons(input: DonorStatusInput): string[] {
  const reasons: string[] = [];
  if (input.hasPastDueSubscription) reasons.push("Past-due recurring donation");
  if (input.hasRecentBankReturn) reasons.push("Recent ACH return");
  if (input.hasOpenDispute) reasons.push("Open dispute");
  if (input.hasRecentRepeatedFailures) reasons.push("Multiple recent failed payments");
  if (input.hasDisabledPaymentMethodOnActiveSubscription) reasons.push("Payment method requires update");
  return reasons;
}
