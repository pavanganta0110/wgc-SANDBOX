import { generateWgcEmailHtml } from "@/lib/email";
import { formatCents } from "@/lib/format";
import { resolveReceiptSettings, type ReceiptSettingsSource } from "@/lib/settings/receiptDefaults";
import { resolveAcknowledgmentText, type AcknowledgmentSettingsSource } from "@/lib/settings/acknowledgmentDefaults";

export interface ReceiptPreviewSampleData {
  donorName: string;
  amountCents: number;
  donorCoveredFeeCents: number;
  fundName: string | null;
  paymentMethodLastFour: string;
  isRecurring: boolean;
  recurringInterval: string | null;
  donationReference: string;
}

export const SAMPLE_RECEIPT_DATA: ReceiptPreviewSampleData = {
  donorName: "Jane Donor",
  amountCents: 10000,
  donorCoveredFeeCents: 320,
  fundName: "General Fund",
  paymentMethodLastFour: "4242",
  isRecurring: true,
  recurringInterval: "Monthly",
  donationReference: "PREVIEW-SAMPLE-0001",
};

/** Renders real receipt HTML from the org's saved (or default) settings + sample data — used for both the in-app preview and the "Send Test Receipt" email, so what an admin previews is exactly what gets sent. */
export function renderReceiptPreviewHtml(
  church: ReceiptSettingsSource &
    AcknowledgmentSettingsSource & {
      name: string;
      addressLine1?: string | null;
      city?: string | null;
      state?: string | null;
      phone?: string | null;
      website?: string | null;
      supportEmail?: string | null;
      primaryContactEmail?: string | null;
      taxId?: string | null;
    },
  data: ReceiptPreviewSampleData = SAMPLE_RECEIPT_DATA,
): { subject: string; bodyHtml: string; html: string } {
  const settings = resolveReceiptSettings(church);
  const orgName = church.name;
  const subject = settings.subjectTemplate.replace(/\[Organization Name\]/gi, orgName);
  const acknowledgmentText = resolveAcknowledgmentText(church, null, null);

  const lines: string[] = [];
  lines.push(`<p>Hi ${data.donorName},</p>`);
  if (settings.header) lines.push(`<p>${settings.header}</p>`);
  lines.push(`<p>Thank you for your ${data.isRecurring ? `recurring (${data.recurringInterval}) ` : ""}gift of <strong>${formatCents(data.amountCents)}</strong> to <strong>${orgName}</strong>.</p>`);
  if (settings.showFund && data.fundName) lines.push(`<p>Fund/Campaign: ${data.fundName}</p>`);
  if (settings.showDonorCoveredFee && data.donorCoveredFeeCents > 0) lines.push(`<p>You generously covered ${formatCents(data.donorCoveredFeeCents)} in processing fees.</p>`);
  if (settings.showPaymentMethodLastFour) lines.push(`<p>Payment Method: •••• ${data.paymentMethodLastFour}</p>`);
  if (settings.showDonationReference) lines.push(`<p>Reference: ${data.donationReference}</p>`);
  if (settings.showTaxId && church.taxId) lines.push(`<p>Tax ID: ${church.taxId}</p>`);
  if (settings.showAddress && church.addressLine1) lines.push(`<p>${church.addressLine1}${church.city ? `, ${church.city}` : ""}${church.state ? `, ${church.state}` : ""}</p>`);
  if (settings.showPhone && church.phone) lines.push(`<p>${church.phone}</p>`);
  if (settings.showWebsite && church.website) lines.push(`<p>${church.website}</p>`);
  if (settings.showEmail) lines.push(`<p>${church.supportEmail || church.primaryContactEmail || ""}</p>`);
  lines.push(`<p>${settings.thankYouMessage}</p>`);
  lines.push(`<p>${acknowledgmentText}</p>`);
  if (settings.footer) lines.push(`<p style="font-size:12px;color:#64748b;">${settings.footer}</p>`);
  lines.push(`<p style="font-size:11px;color:#94a3b8;">${settings.disclaimer}</p>`);

  const bodyHtml = lines.join("\n");
  const html = generateWgcEmailHtml({
    to: "",
    subject,
    title: "Thank You for Your Gift",
    badgeText: "Receipt",
    badgeColor: "#10B981",
    bodyHtml,
  });

  return { subject, bodyHtml, html };
}
