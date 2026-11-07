/**
 * Typed-confirmation rules for the admin "Terminate merchant" action.
 * Termination at the processor is permanent, so the admin must type BOTH
 * the organization's exact name and the word TERMINATE. The server checks
 * this itself — the dialog's disabled button is only a convenience.
 */
export const TERMINATION_CONFIRM_WORD = "TERMINATE";

export const TERMINATION_REASONS = [
  "CHURNED",
  "COMPLIANCE_VIOLATION",
  "EXCESSIVE_ACH_RETURNS",
  "EXCESSIVE_CHARGEBACKS",
  "FRAUD",
  "IDENTITY_THEFT",
  "ILLEGAL_TRANSACTIONS",
  "INSOLVENCY",
  "OTHER",
  "PCI_VIOLATION",
  "PROCESSOR_MIGRATION",
  "SUSPECTED_FRAUD",
  "UNSUPPORTED_BUSINESS_TYPE",
  "UNUSUAL_ACTIVITY",
  "VIOLATED_MERCHANT_TERMS_OF_SERVICE",
] as const;

export type TerminationReason = (typeof TERMINATION_REASONS)[number];

export const MAX_TERMINATION_DESCRIPTION = 1000;

export function isTerminationReason(v: unknown): v is TerminationReason {
  return typeof v === "string" && (TERMINATION_REASONS as readonly string[]).includes(v);
}

/** Exact match after trimming outer whitespace — case-sensitive on purpose. */
export function confirmationMatches(typed: unknown, expected: string): boolean {
  return typeof typed === "string" && typed.trim() === expected.trim() && expected.trim().length > 0;
}
