import { prisma } from "@/lib/prisma";
import { renderToBuffer } from "@react-pdf/renderer";
import { sendWgcEmail } from "@/lib/email";
import { formatCents } from "@/lib/format";
import { formatPersonName } from "@/lib/formatPersonName";
import { resolveReceiptSettings } from "@/lib/settings/receiptDefaults";
import { resolveAcknowledgmentText } from "@/lib/settings/acknowledgmentDefaults";
import { generateReceiptNumber } from "@/lib/giving/receiptNumber";
import { computeRecordedContributionAmountCents } from "@/lib/giving/goodsServices";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { DonationReceiptPdf, type DonationReceiptPdfProps } from "@/lib/giving/pdf/DonationReceiptPdf";
import { RECEIPT_METHOD_LABELS, type ExternalPaymentMethod } from "@/lib/donations/externalDonationTypes";

/**
 * Sends a receipt for an external (non-WGC-processed) donation — the same
 * settings-driven PDF/email pattern as sendDonationReceipt (Payment
 * receipts), reusing the shared DonationReceiptPdf template with its
 * externalDonationNote banner so this is never mistaken for a WGC/Finix-
 * processed transaction. Never includes: internal notes, the
 * proof-of-payment attachment, full external account information, provider
 * credentials, or the provider fee (internal bookkeeping only).
 *
 * Unlike Payment (which keeps a full versioned DonationReceipt history),
 * ExternalDonation tracks only its current receipt state directly on the
 * row (receiptNumber/receiptStatus/receiptSentAt) — the send/resend/failure
 * history itself lives in ExternalDonationAuditLog, which every call here
 * writes to regardless of outcome.
 */
export async function sendExternalDonationReceiptEmail(
  externalDonationId: string,
  churchId: string,
  actorUserId: string | null = null
) {
  const donation = await prisma.externalDonation.findFirst({ where: { id: externalDonationId, churchId } });
  if (!donation) throw new Error("External donation not found");
  if (donation.isAnonymous || !donation.donorId) throw new Error("Cannot send a receipt for an anonymous or unmatched donation");

  const [church, donor] = await Promise.all([
    prisma.church.findUnique({ where: { id: churchId } }),
    prisma.donor.findUnique({ where: { id: donation.donorId } }),
  ]);
  if (!church) throw new Error("Organization not found");
  if (!donor?.email) {
    await markReceiptOutcome(externalDonationId, "SUPPRESSED_MISSING_EMAIL", actorUserId, "No donor email on file");
    throw new Error("Donor is missing an email address — receipt not sent");
  }

  const isResend = Boolean(donation.receiptSentAt);
  const settings = resolveReceiptSettings(church);
  const orgName = church.statementSenderName || church.name;
  const receiptNumber = donation.receiptNumber || generateReceiptNumber(church.receiptNumberPrefix, donation.id, donation.createdAt);
  const donorName = formatPersonName(donor.name || "Donor");

  const methodLabel =
    donation.paymentMethod === "OTHER"
      ? donation.otherPaymentMethodName || "Other"
      : RECEIPT_METHOD_LABELS[donation.paymentMethod as ExternalPaymentMethod] || "Other";

  const donorAddress = donor.addressLine1
    ? [donor.addressLine1, donor.addressLine2, [donor.city, donor.state, donor.postalCode].filter(Boolean).join(", ")].filter(Boolean).join(", ")
    : null;
  const organizationAddress = church.addressLine1
    ? [church.addressLine1, church.addressLine2, [church.city, church.state, church.postalCode].filter(Boolean).join(", ")].filter(Boolean).join(", ")
    : null;

  const goodsServicesProvided = donation.goodsOrServicesProvided;
  const goodsServicesDescription = goodsServicesProvided ? donation.goodsOrServicesDescription : null;
  const goodsServicesFairMarketValueCents = goodsServicesProvided ? donation.goodsOrServicesValueCents ?? 0 : null;
  // A donation the organization marked not-tax-deductible never gets the
  // "no goods or services / fully deductible" acknowledgment language,
  // regardless of the goods/services fields — those two concepts are
  // independent (e.g. a raffle ticket purchase recorded as a donation).
  const recordedContributionAmountCents = !donation.isTaxDeductible
    ? 0
    : donation.deductibleAmountCents != null
      ? donation.deductibleAmountCents
      : goodsServicesProvided
        ? computeRecordedContributionAmountCents(donation.donationAmountCents, goodsServicesFairMarketValueCents ?? 0)
        : donation.donationAmountCents;

  const acknowledgmentText = !donation.isTaxDeductible
    ? "This contribution is not tax-deductible."
    : resolveAcknowledgmentText(church, goodsServicesDescription, goodsServicesFairMarketValueCents);

  const externalReference = donation.confirmationNumber || donation.externalTransactionId || donation.checkNumber || null;

  const pdfProps: DonationReceiptPdfProps = {
    organizationName: orgName,
    organizationLogoUrl: church.logoUrl || null,
    organizationAddress: settings.showAddress ? organizationAddress : null,
    organizationEmail: settings.showEmail ? church.supportEmail || church.primaryContactEmail || null : null,
    organizationPhone: settings.showPhone ? church.phone || null : null,
    organizationWebsite: settings.showWebsite ? church.website || null : null,
    organizationTaxId: settings.showTaxId ? church.taxId || null : null,
    donorName,
    donorEmail: donor.email,
    donorAddress,
    receiptNumber,
    transactionReference: settings.showDonationReference ? externalReference || donation.id : donation.id,
    donationDate: donation.donationDate,
    amountCents: donation.donationAmountCents,
    fundName: settings.showFund ? donation.fundName : null,
    paymentMethodLabel: methodLabel,
    isRecurring: false,
    recurringInterval: null,
    goodsServicesProvided,
    goodsServicesFairMarketValueCents,
    recordedContributionAmountCents,
    acknowledgmentText,
    disclaimer: settings.disclaimer,
    footer: settings.footer,
    externalDonationNote:
      "This gift was recorded as an external / offline donation and was not processed through WGC Payments. It is not included in WGC settlement, deposit, or processing-fee totals.",
  };

  const pdf = await renderToBuffer(DonationReceiptPdf(pdfProps));

  const subject = settings.subjectTemplate.replace(/\[Organization Name\]/gi, orgName);
  const lines: string[] = [];
  lines.push(`<p>Hi ${donorName},</p>`);
  if (settings.header) lines.push(`<p>${settings.header}</p>`);
  lines.push(`<p>Thank you for your gift of <strong>${formatCents(donation.donationAmountCents)}</strong> to <strong>${orgName}</strong>, recorded as an external/offline donation (${methodLabel}).</p>`);
  if (settings.showFund && donation.fundName) lines.push(`<p>Fund/Campaign: ${donation.fundName}</p>`);
  if (settings.showDonationReference) lines.push(`<p>Receipt Number: ${receiptNumber}</p>`);
  lines.push(`<p>${settings.thankYouMessage}</p>`);
  lines.push(`<p>${acknowledgmentText}</p>`);
  if (goodsServicesProvided) {
    lines.push(
      `<p>Payment Amount: ${formatCents(donation.donationAmountCents)}<br/>Fair Market Value: ${formatCents(goodsServicesFairMarketValueCents ?? 0)}<br/>Recorded Contribution Amount: ${formatCents(recordedContributionAmountCents)}</p>`
    );
  }
  if (settings.footer) lines.push(`<p style="font-size:12px;color:#64748b;">${settings.footer}</p>`);
  lines.push(`<p style="font-size:11px;color:#94a3b8;">${settings.disclaimer}</p>`);

  const result = await sendWgcEmail({
    to: donor.email,
    subject,
    title: "Thank You for Your Gift",
    badgeText: "Receipt",
    badgeColor: "#10B981",
    previewText: `Receipt for your ${formatCents(donation.donationAmountCents)} gift`,
    bodyHtml: lines.join("\n"),
    attachments: [{ filename: `receipt-${receiptNumber}.pdf`, content: pdf as unknown as Buffer }],
    log: {
      churchId,
      donorId: donor.id,
      recipientName: donorName,
      category: "EXTERNAL_DONATION_RECEIPT",
      relatedEntityType: "ExternalDonation",
      relatedEntityId: externalDonationId,
      createdByUserId: actorUserId,
      isResend,
    },
  });

  await prisma.externalDonation.update({
    where: { id: externalDonationId },
    data: {
      receiptNumber,
      receiptStatus: result.success ? (isResend ? "RESENT" : "SENT") : "FAILED",
      receiptSentAt: result.success ? new Date() : donation.receiptSentAt,
    },
  });

  await prisma.externalDonationAuditLog.create({
    data: {
      externalDonationId,
      action: result.success ? (isResend ? "RECEIPT_RESENT" : "RECEIPT_SENT") : "RECEIPT_FAILED",
      performedByUserId: actorUserId,
    },
  });

  await logDashboardAction({
    churchId,
    actorUserId,
    action: result.success ? "external_donation.receipt_sent" : "external_donation.receipt_failed",
    entityType: "ExternalDonation",
    entityId: externalDonationId,
    metadata: { receiptNumber, isResend, success: result.success },
  });

  return { ...result, receiptNumber, recipientEmail: donor.email };
}

async function markReceiptOutcome(externalDonationId: string, receiptStatus: string, actorUserId: string | null, note: string) {
  await prisma.externalDonation.update({ where: { id: externalDonationId }, data: { receiptStatus } });
  await prisma.externalDonationAuditLog.create({
    data: { externalDonationId, action: "RECEIPT_SUPPRESSED", toValue: note, performedByUserId: actorUserId },
  });
}

/**
 * Renders the receipt PDF for download/print without sending an email or
 * mutating receipt-sent state — used by the "Download receipt" action.
 * Requires a donor with a name (anonymous/unmatched donations have no
 * receipt to render, same rule as sending).
 */
export async function renderExternalDonationReceiptPdf(externalDonationId: string, churchId: string): Promise<{ pdf: Buffer; receiptNumber: string; fileName: string }> {
  const donation = await prisma.externalDonation.findFirst({ where: { id: externalDonationId, churchId } });
  if (!donation) throw new Error("External donation not found");
  if (donation.isAnonymous || !donation.donorId) throw new Error("Cannot generate a receipt for an anonymous or unmatched donation");

  const [church, donor] = await Promise.all([
    prisma.church.findUnique({ where: { id: churchId } }),
    prisma.donor.findUnique({ where: { id: donation.donorId } }),
  ]);
  if (!church) throw new Error("Organization not found");

  const settings = resolveReceiptSettings(church);
  const orgName = church.statementSenderName || church.name;
  const receiptNumber = donation.receiptNumber || generateReceiptNumber(church.receiptNumberPrefix, donation.id, donation.createdAt);
  const donorName = formatPersonName(donor?.name || "Donor");

  const methodLabel =
    donation.paymentMethod === "OTHER"
      ? donation.otherPaymentMethodName || "Other"
      : RECEIPT_METHOD_LABELS[donation.paymentMethod as ExternalPaymentMethod] || "Other";

  const donorAddress = donor?.addressLine1
    ? [donor.addressLine1, donor.addressLine2, [donor.city, donor.state, donor.postalCode].filter(Boolean).join(", ")].filter(Boolean).join(", ")
    : null;
  const organizationAddress = church.addressLine1
    ? [church.addressLine1, church.addressLine2, [church.city, church.state, church.postalCode].filter(Boolean).join(", ")].filter(Boolean).join(", ")
    : null;

  const goodsServicesProvided = donation.goodsOrServicesProvided;
  const goodsServicesDescription = goodsServicesProvided ? donation.goodsOrServicesDescription : null;
  const goodsServicesFairMarketValueCents = goodsServicesProvided ? donation.goodsOrServicesValueCents ?? 0 : null;
  const recordedContributionAmountCents = !donation.isTaxDeductible
    ? 0
    : donation.deductibleAmountCents != null
      ? donation.deductibleAmountCents
      : goodsServicesProvided
        ? computeRecordedContributionAmountCents(donation.donationAmountCents, goodsServicesFairMarketValueCents ?? 0)
        : donation.donationAmountCents;

  const acknowledgmentText = !donation.isTaxDeductible
    ? "This contribution is not tax-deductible."
    : resolveAcknowledgmentText(church, goodsServicesDescription, goodsServicesFairMarketValueCents);

  const externalReference = donation.confirmationNumber || donation.externalTransactionId || donation.checkNumber || null;

  const pdfProps: DonationReceiptPdfProps = {
    organizationName: orgName,
    organizationLogoUrl: church.logoUrl || null,
    organizationAddress: settings.showAddress ? organizationAddress : null,
    organizationEmail: settings.showEmail ? church.supportEmail || church.primaryContactEmail || null : null,
    organizationPhone: settings.showPhone ? church.phone || null : null,
    organizationWebsite: settings.showWebsite ? church.website || null : null,
    organizationTaxId: settings.showTaxId ? church.taxId || null : null,
    donorName,
    donorEmail: donor?.email || null,
    donorAddress,
    receiptNumber,
    transactionReference: settings.showDonationReference ? externalReference || donation.id : donation.id,
    donationDate: donation.donationDate,
    amountCents: donation.donationAmountCents,
    fundName: settings.showFund ? donation.fundName : null,
    paymentMethodLabel: methodLabel,
    isRecurring: false,
    recurringInterval: null,
    goodsServicesProvided,
    goodsServicesFairMarketValueCents,
    recordedContributionAmountCents,
    acknowledgmentText,
    disclaimer: settings.disclaimer,
    footer: settings.footer,
    externalDonationNote:
      "This gift was recorded as an external / offline donation and was not processed through WGC Payments. It is not included in WGC settlement, deposit, or processing-fee totals.",
  };

  const pdf = await renderToBuffer(DonationReceiptPdf(pdfProps));
  return { pdf: pdf as unknown as Buffer, receiptNumber, fileName: `receipt-${receiptNumber}.pdf` };
}
