/**
 * "Record External Donation" — shared types and enums for donations a
 * merchant received outside WGC Payments (cash, check, Cash App, Zelle,
 * Venmo, PayPal, bank transfer, external card terminal, money order, or
 * another method). See ExternalDonation in prisma/schema.prisma for the
 * storage model and why it's kept separate from Payment.
 */

export const EXTERNAL_PAYMENT_METHODS = [
  "CASH",
  "CHECK",
  "CASH_APP",
  "ZELLE",
  "VENMO",
  "PAYPAL",
  "BANK_TRANSFER",
  "EXTERNAL_CARD_TERMINAL",
  "MONEY_ORDER",
  "OTHER",
] as const;
export type ExternalPaymentMethod = (typeof EXTERNAL_PAYMENT_METHODS)[number];

export const EXTERNAL_PAYMENT_METHOD_LABELS: Record<ExternalPaymentMethod, string> = {
  CASH: "Cash",
  CHECK: "Check",
  CASH_APP: "Cash App",
  ZELLE: "Zelle",
  VENMO: "Venmo",
  PAYPAL: "PayPal",
  BANK_TRANSFER: "Bank Transfer",
  EXTERNAL_CARD_TERMINAL: "External Card Terminal",
  MONEY_ORDER: "Money Order",
  OTHER: "Other",
};

/** Payment methods that use the "External Digital Payment" details group
 * (external transaction ID, confirmation number, provider fee, account label). */
export const DIGITAL_PROVIDER_METHODS = new Set<ExternalPaymentMethod>(["CASH_APP", "ZELLE", "VENMO", "PAYPAL"]);

export const EXTERNAL_DONATION_SOURCES = [
  "EXTERNAL_DIGITAL_PAYMENT",
  "CASH",
  "CHECK",
  "EXTERNAL_BANK_TRANSFER",
  "EXTERNAL_CARD_PAYMENT",
  "OTHER_OFFLINE_PAYMENT",
] as const;
export type ExternalDonationSource = (typeof EXTERNAL_DONATION_SOURCES)[number];

/** WGC_ONLINE_PAYMENT is the only source classification never produced by
 * this module — it belongs to Finix-processed Payment rows, which never
 * flow through ExternalDonation. */
export const SOURCE_LABELS: Record<ExternalDonationSource | "WGC_ONLINE_PAYMENT", string> = {
  WGC_ONLINE_PAYMENT: "WGC Online",
  EXTERNAL_DIGITAL_PAYMENT: "External Digital Payment",
  CASH: "Cash",
  CHECK: "Check",
  EXTERNAL_BANK_TRANSFER: "External Bank Transfer",
  EXTERNAL_CARD_PAYMENT: "External Card Payment",
  OTHER_OFFLINE_PAYMENT: "Other Offline Payment",
};

/** Per-method receipt/statement display label — distinct from SOURCE_LABELS
 * because the donor-facing wording ("Cash App" on a receipt) is more
 * specific than the internal source bucket it rolls up into. */
export const RECEIPT_METHOD_LABELS: Record<ExternalPaymentMethod, string> = {
  CASH: "Cash",
  CHECK: "Check",
  CASH_APP: "Cash App",
  ZELLE: "Zelle",
  VENMO: "Venmo",
  PAYPAL: "PayPal",
  BANK_TRANSFER: "Bank Transfer",
  EXTERNAL_CARD_TERMINAL: "External Card Payment",
  MONEY_ORDER: "Money Order",
  OTHER: "Other",
};

/** The one and only mapping from payment method to source classification —
 * every write path must derive `source` from this, never accept it
 * directly from the client. */
export function classifySource(method: ExternalPaymentMethod): ExternalDonationSource {
  if (DIGITAL_PROVIDER_METHODS.has(method)) return "EXTERNAL_DIGITAL_PAYMENT";
  switch (method) {
    case "CASH":
      return "CASH";
    case "CHECK":
      return "CHECK";
    case "BANK_TRANSFER":
      return "EXTERNAL_BANK_TRANSFER";
    case "EXTERNAL_CARD_TERMINAL":
      return "EXTERNAL_CARD_PAYMENT";
    case "MONEY_ORDER":
    case "OTHER":
    default:
      return "OTHER_OFFLINE_PAYMENT";
  }
}

export const EXTERNAL_DONATION_STATUSES = ["RECEIVED", "PENDING_CONFIRMATION", "DEPOSITED", "CORRECTED", "VOIDED"] as const;
export type ExternalDonationStatus = (typeof EXTERNAL_DONATION_STATUSES)[number];

/** Checks alone get a richer deposit lifecycle than the generic status list. */
export const CHECK_DEPOSIT_STATUSES = ["RECEIVED", "DEPOSITED", "CLEARED", "RETURNED", "VOIDED"] as const;
export type CheckDepositStatus = (typeof CHECK_DEPOSIT_STATUSES)[number];

export const DONOR_MATCH_STATUSES = ["MATCHED", "ANONYMOUS", "UNMATCHED"] as const;
export type DonorMatchStatus = (typeof DONOR_MATCH_STATUSES)[number];

export const RECEIPT_STATUSES = [
  "NOT_SENT",
  "QUEUED",
  "SENT",
  "FAILED",
  "RESENT",
  "SUPPRESSED_MISSING_EMAIL",
  "SUPPRESSED_BY_USER",
] as const;
export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number];

export const RECEIPT_STATUS_LABELS: Record<ReceiptStatus, string> = {
  NOT_SENT: "Not sent",
  QUEUED: "Queued",
  SENT: "Sent",
  FAILED: "Failed",
  RESENT: "Resent",
  SUPPRESSED_MISSING_EMAIL: "Suppressed — no email",
  SUPPRESSED_BY_USER: "Suppressed",
};

/** ExternalDonation.receiptStatus is nullable (never sent yet) — this
 * normalizes null to the explicit NOT_SENT label everywhere it's displayed. */
export function receiptStatusLabel(status: string | null): string {
  return RECEIPT_STATUS_LABELS[status as ReceiptStatus] || "Not sent";
}

export function isExternalPaymentMethod(value: unknown): value is ExternalPaymentMethod {
  return typeof value === "string" && (EXTERNAL_PAYMENT_METHODS as readonly string[]).includes(value);
}

/** Statuses excluded from active donation totals and annual statements —
 * a voided row or a returned check never counts, but is never deleted. */
export function isExcludedFromTotals(status: string, depositStatus: string | null): boolean {
  if (status === "VOIDED") return true;
  if (depositStatus === "RETURNED") return true;
  return false;
}
