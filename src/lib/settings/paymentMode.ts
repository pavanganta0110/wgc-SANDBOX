/**
 * Per-organization "payment processor" mode (e.g. MBTS): switches that change
 * wording, receipts and fields for orgs that use WGC as a general card
 * processor rather than a donation platform. Every switch defaults to the
 * existing behavior, so an org that never opts in is unaffected.
 */
import { normalizeTermLabel } from "@/lib/students/constants";

export const RECEIPT_NOTE_MODES = ["NONE", "CUSTOMER", "STAFF", "BOTH"] as const;
export type ReceiptNoteMode = (typeof RECEIPT_NOTE_MODES)[number];

export function parseReceiptNoteMode(value: unknown): ReceiptNoteMode {
  return RECEIPT_NOTE_MODES.includes(value as ReceiptNoteMode) ? (value as ReceiptNoteMode) : "NONE";
}

/** Whether the payment's note belongs on the receipt the payer gets. */
export function noteOnCustomerReceipt(mode: unknown): boolean {
  const m = parseReceiptNoteMode(mode);
  return m === "CUSTOMER" || m === "BOTH";
}

/** Whether the payment's note belongs on the staff/merchant notification. */
export function noteOnStaffCopy(mode: unknown): boolean {
  const m = parseReceiptNoteMode(mode);
  return m === "STAFF" || m === "BOTH";
}

export type PaymentModeSettings = {
  paymentMode: boolean;
  receiptNoteMode: ReceiptNoteMode;
  termFieldEnabled: boolean;
  brandedDashboard: boolean;
};

export const PAYMENT_MODE_SETTINGS_SELECT = {
  paymentMode: true,
  receiptNoteMode: true,
  termFieldEnabled: true,
  brandedDashboard: true,
} as const;

/**
 * The term a payment is tagged with. When the org has the term field on, the
 * term staff typed wins (that is the point: tag a prior semester); otherwise
 * the student's current term (or none) applies exactly as before. A term sent
 * by a client whose org has the field off is ignored, never trusted.
 */
export function resolvePaymentTerm(params: {
  termFieldEnabled: boolean;
  submittedTerm: unknown;
  studentTerm: string | null;
}): string | null {
  const chosen = params.termFieldEnabled ? normalizeTermLabel(params.submittedTerm) : null;
  return chosen ?? params.studentTerm ?? null;
}

/**
 * Receipt wording for payment mode. These replace only the built-in defaults:
 * anything the organization saved in Settings → Receipts still wins. The
 * acknowledgment drops the donation-style "no goods or services … in exchange
 * for this contribution" sentence, which does not fit an ordinary payment.
 */
export const PAYMENT_MODE_RECEIPT_TEXT = {
  subject: "Receipt for your payment to [Organization Name]",
  thankYou: "Thank you for your payment.",
  disclaimer: "This receipt confirms a payment recorded by the organization. It is provided for record-keeping purposes only.",
  noGoodsServices: "Thank you for your payment.",
  goodsServicesTemplate:
    "Goods or services described as [DESCRIPTION], with an estimated value of [VALUE], were provided in exchange for this payment.",
  pdfTitle: "Payment Receipt",
  pdfPayerSection: "Payer",
  pdfPaymentSection: "Payment",
  pdfCoveredFee: "Processing Fee Covered by Payer",
  emailTitle: "Payment Receipt",
  emailBadge: "Receipt",
  emailLine: (amount: string, org: string) => `Thank you for your payment of <strong>${amount}</strong> to <strong>${org}</strong>.`,
  missingEmailError: "Payer is missing an email address — receipt not sent",
} as const;

const WORDS = {
  donor: ["Donor", "Payer"],
  donors: ["Donors", "Payers"],
  donation: ["Donation", "Payment"],
  donations: ["Donations", "Payments"],
  gift: ["Gift", "Payment"],
  gifts: ["Gifts", "Payments"],
  giving: ["Giving", "Payments"],
} as const;

export type ModeWord = keyof typeof WORDS;

/**
 * The label for a donor-facing word. With paymentMode off this returns the
 * original wording unchanged ("Donor"); with it on, the payer/payment
 * equivalent ("Payer"). `lower` gives the mid-sentence form.
 */
export function modeLabel(paymentMode: boolean | null | undefined, word: ModeWord, opts?: { lower?: boolean }): string {
  const [original, payment] = WORDS[word];
  const label = paymentMode ? payment : original;
  return opts?.lower ? label.toLowerCase() : label;
}

const REWORDING: [RegExp, string][] = [
  [/\bDonate with\b/g, "Pay with"],
  [/\bGive anonymously\b/g, "Pay anonymously"],
  [/^Give\b/, "Pay"],
  [/\bView my giving\b/g, "View my payments"],
  [/\bMy Giving\b/g, "My Payments"],
  [/\bGiving Links\b/g, "Payment Links"],
  [/\bGiving Link\b/g, "Payment Link"],
  [/\bgiving links\b/g, "payment links"],
  [/\bgiving link\b/g, "payment link"],
  [/\bgiving records\b/g, "payment records"],
  [/\bto give\b/g, "to pay"],
  [/\bwho gave\b/g, "who paid"],
  [/\bDonated\b/g, "Paid"],
  [/\bdonated\b/g, "paid"],
  [/\bGiving Campaigns\b/g, "Payment Campaigns"],
  [/\bAnnual Giving\b/g, "Annual Payments"],
  [/\bText to Give\b/g, "Text to Pay"],
  [/^Giving$/, "Payments"],
  [/\bGiving history\b/g, "Payment history"],
  [/\bWays to give\b/g, "Ways to pay"],
  [/\bgiving options\b/g, "payment options"],
  [/\byour giving\b/g, "your payments"],
  [/\bgiving record\b/g, "payment record"],
  [/\bgave with\b/g, "paid with"],
  [/\bSecure Giving\b/g, "Secure Payment"],
  [/\bRecurring Giving\b/g, "Recurring Payments"],
  [/\bannual giving statements\b/g, "annual payment statements"],
  [/\bgiving form\b/g, "payment form"],
  [/\bDonations\b/g, "Payments"],
  [/\bdonations\b/g, "payments"],
  [/\bDonation\b/g, "Payment"],
  [/\bdonation\b/g, "payment"],
  [/\bGifts\b/g, "Payments"],
  [/\bgifts\b/g, "payments"],
  [/\bGift\b/g, "Payment"],
  [/\bgift\b/g, "payment"],
  [/\bDonors\b/g, "Payers"],
  [/\bdonors\b/g, "payers"],
  [/\bDonor\b/g, "Payer"],
  [/\bdonor\b/g, "payer"],
  [/\bDonate\b/g, "Pay"],
  [/\bdonate\b/g, "pay"],
];

/**
 * Rewrites a short piece of donation-style copy ("Thank You for Your Gift",
 * "Give $25.00", "Donor Information") into payment wording. Used by the
 * public payment page for orgs in payment mode, where the same component
 * serves donation pages for everyone else. Text with none of these words is
 * returned untouched.
 */
export function toPaymentWording(text: string): string {
  return REWORDING.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), text);
}

/** Validates an admin PATCH body: only the keys present are returned, anything malformed is an error. */
export function parsePaymentModeUpdate(body: unknown): { data: Partial<PaymentModeSettings> } | { error: string } {
  if (!body || typeof body !== "object") return { error: "Invalid request body." };
  const input = body as Record<string, unknown>;
  const data: Partial<PaymentModeSettings> = {};
  for (const key of ["paymentMode", "termFieldEnabled", "brandedDashboard"] as const) {
    if (key in input) {
      if (typeof input[key] !== "boolean") return { error: `${key} must be true or false.` };
      data[key] = input[key] as boolean;
    }
  }
  if ("receiptNoteMode" in input) {
    if (!RECEIPT_NOTE_MODES.includes(input.receiptNoteMode as ReceiptNoteMode)) {
      return { error: "receiptNoteMode must be NONE, CUSTOMER, STAFF or BOTH." };
    }
    data.receiptNoteMode = input.receiptNoteMode as ReceiptNoteMode;
  }
  if (Object.keys(data).length === 0) return { error: "Nothing to update." };
  return { data };
}
