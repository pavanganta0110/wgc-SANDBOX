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
