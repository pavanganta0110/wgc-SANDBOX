// TODO: Confirm exact Finix termination/suspension API and webhook event with Finix.
// Finix's merchant.onboarding_state today confirms PROVISIONING / APPROVED /
// UPDATE_REQUESTED / REJECTED. Suspension/termination is not yet confirmed to
// arrive via merchant.updated or a dedicated event — do not assume behavior.

export type WgcMerchantStatus =
  | "pending"
  | "submitted"
  | "under_review"
  | "approved"
  | "update_requested"
  | "rejected"
  | "suspended"
  | "terminated"
  | "closed"
  | "disabled"
  | "unknown";

/**
 * Maps a Finix merchant onboarding_state (and, once confirmed, any
 * termination/suspension signal) to WGC's own status vocabulary. This does
 * NOT replace the existing onboardingStatus logic in the webhook handler —
 * it's for the new FinixMerchantSnapshot / admin reporting layer only.
 */
export function mapFinixOnboardingStateToWgcStatus(
  onboardingState: string | null | undefined,
  status: string | null | undefined
): WgcMerchantStatus {
  const state = (onboardingState || "").toUpperCase();
  const s = (status || "").toUpperCase();

  if (state === "APPROVED" || s === "APPROVED") return "approved";
  if (state === "UPDATE_REQUESTED") return "update_requested";
  if (state === "REJECTED" || s === "REJECTED" || s === "FAILED") return "rejected";
  if (state === "PROVISIONING") return "under_review";
  if (!state && !s) return "pending";

  return "unknown";
}

export function mapFinixTransferStateToWgcStatus(state: string | null | undefined): string {
  const s = (state || "").toUpperCase();
  if (s === "SUCCEEDED") return "succeeded";
  if (s === "PENDING") return "pending";
  if (s === "FAILED") return "failed";
  if (s === "CANCELED") return "canceled";
  return "unknown";
}

export function mapFinixDisputeStateToWgcStatus(state: string | null | undefined): string {
  const s = (state || "").toUpperCase();
  if (s === "PENDING") return "pending";
  if (s === "WON") return "won";
  if (s === "LOST") return "lost";
  if (s === "EXPIRED") return "expired";
  return "unknown";
}
