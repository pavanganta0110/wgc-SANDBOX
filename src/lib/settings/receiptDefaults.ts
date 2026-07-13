export const DEFAULT_RECEIPT_SUBJECT_TEMPLATE = "Thank you for your gift to [Organization Name]";
export const DEFAULT_RECEIPT_THANK_YOU_MESSAGE = "Thank you for your generosity — your support makes a real difference.";
export const DEFAULT_RECEIPT_DISCLAIMER =
  "This receipt confirms a donation recorded by the organization. It is provided for record-keeping purposes only and does not constitute tax advice. Donors should consult a qualified tax professional regarding their individual circumstances.";

export interface ReceiptSettingsSource {
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
    subjectTemplate: church?.receiptSubjectTemplate || DEFAULT_RECEIPT_SUBJECT_TEMPLATE,
    header: church?.receiptHeader || null,
    thankYouMessage: church?.receiptThankYouMessage || DEFAULT_RECEIPT_THANK_YOU_MESSAGE,
    footer: church?.receiptFooter || null,
    showAddress: church?.receiptShowAddress ?? true,
    showPhone: church?.receiptShowPhone ?? false,
    showEmail: church?.receiptShowEmail ?? true,
    showFund: church?.receiptShowFund ?? true,
    showDonorCoveredFee: church?.receiptShowDonorCoveredFee ?? false,
    showPaymentMethodLastFour: church?.receiptShowPaymentMethodLastFour ?? true,
    showRecurringSchedule: church?.receiptShowRecurringSchedule ?? true,
    showDonationReference: church?.receiptShowDonationReference ?? true,
    showTaxId: church?.receiptShowTaxId ?? false,
    showWebsite: church?.receiptShowWebsite ?? false,
    disclaimer: church?.receiptDisclaimer || DEFAULT_RECEIPT_DISCLAIMER,
    language: church?.receiptLanguage || "en",
  };
}
