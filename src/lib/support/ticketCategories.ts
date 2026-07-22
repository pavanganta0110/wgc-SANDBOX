export const TICKET_CATEGORIES = [
  { value: "PAYMENT", label: "Payment" },
  { value: "REFUND", label: "Refund" },
  { value: "BANK_RETURN", label: "Bank Return" },
  { value: "DISPUTE", label: "Dispute" },
  { value: "SETTLEMENT", label: "Settlement" },
  { value: "DEPOSIT", label: "Deposit" },
  { value: "SUBSCRIPTION", label: "Subscription" },
  { value: "RECURRING_DONOR", label: "Recurring Donor" },
  { value: "DONOR", label: "Donor" },
  { value: "GIVING_LINK", label: "Giving Link" },
  { value: "ANNUAL_STATEMENT", label: "Annual Statement" },
  { value: "FEES", label: "Fees & Pricing" },
  { value: "ACCOUNT_ACCESS", label: "Account Access" },
  { value: "SECURITY", label: "Security" },
  { value: "VERIFICATION", label: "Verification" },
  { value: "INTEGRATION", label: "Integration" },
  { value: "OTHER", label: "Other" },
] as const;

export const TICKET_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export const TICKET_STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_ON_ORGANIZATION", "WAITING_ON_SUPPORT", "RESOLVED", "CLOSED"] as const;

export function isValidCategory(value: unknown): boolean {
  return typeof value === "string" && TICKET_CATEGORIES.some((c) => c.value === value);
}
export function isValidPriority(value: unknown): boolean {
  return typeof value === "string" && (TICKET_PRIORITIES as readonly string[]).includes(value);
}
export function categoryLabel(value: string): string {
  return TICKET_CATEGORIES.find((c) => c.value === value)?.label || value;
}

/** Merchant-facing status labels — WAITING_ON_ORGANIZATION is this
 * schema's existing name for "the ball is in the merchant's court,"
 * displayed to the merchant as "Waiting on You." WAITING_ON_SUPPORT
 * covers the same idea from the merchant's own side (they just replied,
 * now WGC needs to act) and shows as "In Progress" to avoid a merchant-
 * facing status that implies WGC is waiting on someone else. */
export function merchantStatusLabel(status: string): string {
  switch (status) {
    case "OPEN":
      return "Open";
    case "IN_PROGRESS":
    case "WAITING_ON_SUPPORT":
      return "In Progress";
    case "WAITING_ON_ORGANIZATION":
      return "Waiting on You";
    case "RESOLVED":
      return "Resolved";
    case "CLOSED":
      return "Closed";
    default:
      return status;
  }
}
