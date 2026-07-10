// Common card-network decline codes, mapped to a donor-safe label. Anything
// not in this list falls back to "Generic Decline" rather than surfacing a
// raw processor code to a church admin.
const CARD_DECLINE_LABELS: Record<string, string> = {
  DO_NOT_HONOR: "Do Not Honor",
  INVALID_CVV: "Invalid CVV",
  EXPIRED_CARD: "Expired Card",
  RESTRICTED_CARD: "Restricted Card",
  INSUFFICIENT_FUNDS: "Insufficient Funds",
  INVALID_ACCOUNT_NUMBER: "Invalid Account Number",
  CARD_DECLINED: "Generic Decline",
  PROCESSING_ERROR: "Processing Error",
  FRAUD_SUSPECTED: "Restricted Card",
  LOST_OR_STOLEN: "Restricted Card",
  INVALID_AMOUNT: "Invalid Amount",
};

export function describeFailureCode(failureCode: string | null | undefined): string {
  if (!failureCode) return "Generic Decline";
  const key = failureCode.toUpperCase().trim();
  return CARD_DECLINE_LABELS[key] || "Generic Decline";
}
