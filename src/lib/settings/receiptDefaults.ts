export const DEFAULT_RECEIPT_SUBJECT_TEMPLATE = "Thank you for your gift to [Organization Name]";
export const DEFAULT_RECEIPT_THANK_YOU_MESSAGE = "Thank you for your generosity — your support makes a real difference.";
export const DEFAULT_RECEIPT_DISCLAIMER =
  "This receipt confirms a donation recorded by the organization. It is provided for record-keeping purposes only and does not constitute tax advice. Donors should consult a qualified tax professional regarding their individual circumstances.";

import { PAYMENT_MODE_RECEIPT_TEXT } from "@/lib/settings/paymentMode";

export interface ReceiptSettingsSource {
  /** Payment-processor mode: swaps only the built-in default texts below for payment wording. */
  paymentMode?: boolean | null;
  receiptAutoSend?: boolean | null;
  receiptSenderName?: string | null;
  receiptReplyToEmail?: string | null;
  receiptSubjectTemplate?: string | null;
  receiptHeader?: string | null;
  receiptThankYouMessage?: string | null;
  receiptFooter?: string | null;
  receiptShowAddress?: boolean | null;
  receiptShowPhone?: boolean | null;
  receiptShowEmail?: boolean | null;
  receiptShowFund?: boolean | null;
  receiptShowDonorCoveredFee?: boolean | null;
  receiptShowPaymentMethodLastFour?: boolean | null;
  receiptShowRecurringSchedule?: boolean | null;
  receiptShowDonationReference?: boolean | null;
  receiptShowTaxId?: boolean | null;
  receiptShowWebsite?: boolean | null;
  receiptDisclaimer?: string | null;
  receiptLanguage?: string | null;
}

/** Same fallback pattern as resolveStatementPdfSettings — custom text if set, else the built-in default. */
export function resolveReceiptSettings(church: ReceiptSettingsSource | null) {
  return {
    autoSend: church?.receiptAutoSend ?? true,
    senderName: church?.receiptSenderName || null,
    replyToEmail: church?.receiptReplyToEmail || null,
    subjectTemplate:
      church?.receiptSubjectTemplate || (church?.paymentMode ? PAYMENT_MODE_RECEIPT_TEXT.subject : DEFAULT_RECEIPT_SUBJECT_TEMPLATE),
    header: church?.receiptHeader || null,
    thankYouMessage:
      church?.receiptThankYouMessage || (church?.paymentMode ? PAYMENT_MODE_RECEIPT_TEXT.thankYou : DEFAULT_RECEIPT_THANK_YOU_MESSAGE),
    footer: church?.receiptFooter || null,
    showAddress: church?.receiptShowAddress ?? true,
    showPhone: church?.receiptShowPhone ?? false,
    showEmail: church?.receiptShowEmail ?? true,
    showFund: church?.receiptShowFund ?? true,
    // A payment-mode org's receipt always itemizes a fee the payer covered, so the receipt adds up to the card
    // charge the payer sees. Other organizations keep the saved setting (off by default).
    showDonorCoveredFee: church?.paymentMode ? true : (church?.receiptShowDonorCoveredFee ?? false),
    showPaymentMethodLastFour: church?.receiptShowPaymentMethodLastFour ?? true,
    showRecurringSchedule: church?.receiptShowRecurringSchedule ?? true,
    showDonationReference: church?.receiptShowDonationReference ?? true,
    showTaxId: church?.receiptShowTaxId ?? false,
    showWebsite: church?.receiptShowWebsite ?? false,
    disclaimer: church?.receiptDisclaimer || (church?.paymentMode ? PAYMENT_MODE_RECEIPT_TEXT.disclaimer : DEFAULT_RECEIPT_DISCLAIMER),
    language: church?.receiptLanguage || "en",
  };
}
