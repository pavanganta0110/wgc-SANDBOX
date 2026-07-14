import { prisma } from "@/lib/prisma";
import { renderToBuffer } from "@react-pdf/renderer";
import { sendWgcEmail } from "@/lib/email";
import { formatCents } from "@/lib/format";
import { formatPersonName } from "@/lib/formatPersonName";
import { resolveReceiptSettings } from "@/lib/settings/receiptDefaults";
import { resolveAcknowledgmentText } from "@/lib/settings/acknowledgmentDefaults";
import { generateReceiptNumber } from "@/lib/giving/receiptNumber";
import { computeRecordedContributionAmountCents } from "@/lib/giving/goodsServices";
import { describeInstrumentType } from "@/lib/givingLinks/attempts";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { DonationReceiptPdf, type DonationReceiptPdfProps } from "@/lib/giving/pdf/DonationReceiptPdf";

/**
 * The single, settings-driven path for a completed donation's receipt —
 * both the email body and the attached PDF are built from the organization's
 * saved Settings -> Receipts configuration (falling back to neutral
 * defaults when unset), the same settings an admin sees in the in-app
 * preview. Never assumes the organization is a church; every string here
 * reads from Church.name / organization settings, not a hardcoded label.
 *
 * Every call creates a new, immutable DonationReceipt version — the first
 * call for a payment creates version 1; any later call (a correction to
 * goods/services info, or an explicit resend) supersedes the prior
 * non-superseded version and creates the next one. Nothing about a
 * previously issued receipt is ever mutated in place, so a donor who
 * already received version 1 can be shown exactly what changed.
 */
export async function sendDonationReceipt(paymentId: string, churchId: string, actorUserId: string | null = null) {
  const payment = await prisma.payment.findFirst({ where: { id: paymentId, churchId } });
  if (!payment) throw new Error("Payment not found");

  const [church, donor, instrument] = await Promise.all([
    prisma.church.findUnique({ where: { id: churchId } }),
    payment.donorId ? prisma.donor.findUnique({ where: { id: payment.donorId } }) : null,
    payment.finixPaymentInstrumentId
      ? prisma.finixPaymentInstrumentSnapshot.findUnique({ where: { finixPaymentInstrumentId: payment.finixPaymentInstrumentId } })
      : null,
  ]);
  if (!church) throw new Error("Organization not found");

  const donorEmail = donor?.email;
  if (!donorEmail) throw new Error("Donor is missing an email address — receipt not sent");

  const settings = resolveReceiptSettings(church);
  const orgName = church.statementSenderName || church.name;

  const receiptNumber = payment.receiptNumber || generateReceiptNumber(church.receiptNumberPrefix, payment.id, payment.createdAt);

  const isAnonymousDisplay = donor?.anonymousPreference || payment.isAnonymous;
  const donorName = isAnonymousDisplay ? "Anonymous Donor" : formatPersonName(donor?.name || "Donor");

  const last4 = instrument?.cardLast4 || instrument?.bankLast4 || null;
  const paymentMethodLabel = `${describeInstrumentType(payment.paymentMethodType)}${last4 ? ` •••• ${last4}` : ""}`;

  const donorAddress = donor?.addressLine1
    ? [donor.addressLine1, donor.addressLine2, [donor.city, donor.state, donor.postalCode].filter(Boolean).join(", ")].filter(Boolean).join(", ")
    : null;

  const organizationAddress = church.addressLine1
    ? [church.addressLine1, church.addressLine2, [church.city, church.state, church.postalCode].filter(Boolean).join(", ")].filter(Boolean).join(", ")
    : null;

  const paymentAmountCents = payment.donationAmountCents ?? payment.amountCents;
  const goodsServicesProvided = payment.goodsServicesProvided;
  const goodsServicesDescription = goodsServicesProvided ? payment.goodsServicesDescription : null;
  const goodsServicesFairMarketValueCents = goodsServicesProvided ? payment.goodsServicesFairMarketValueCents ?? 0 : null;
  const recordedContributionAmountCents =
    payment.recordedContributionAmountCents ??
    (goodsServicesProvided ? computeRecordedContributionAmountCents(paymentAmountCents, goodsServicesFairMarketValueCents ?? 0) : paymentAmountCents);

  const acknowledgmentText = resolveAcknowledgmentText(church, goodsServicesDescription, goodsServicesFairMarketValueCents);
  const designationText = payment.designationType === "PERSON" && payment.selectedPersonNameSnapshot
    ? `Support for ${payment.selectedPersonNameSnapshot}`
    : null;

  const pdfProps: DonationReceiptPdfProps = {
    organizationName: orgName,
    organizationLogoUrl: church.logoUrl || null,
    organizationAddress: settings.showAddress ? organizationAddress : null,
    organizationEmail: settings.showEmail ? church.supportEmail || church.primaryContactEmail || null : null,
    organizationPhone: settings.showPhone ? church.phone || null : null,
    organizationWebsite: settings.showWebsite ? church.website || null : null,
    organizationTaxId: settings.showTaxId ? church.taxId || null : null,
    donorName,
    donorEmail: isAnonymousDisplay ? null : donorEmail,
    donorAddress,
    receiptNumber,
    transactionReference: settings.showDonationReference ? payment.finixTransferId || payment.id : payment.id,
    donationDate: payment.createdAt,
    amountCents: paymentAmountCents,
    fundName: settings.showFund ? payment.fundName : null,
    designationText,
    paymentMethodLabel: settings.showPaymentMethodLastFour ? paymentMethodLabel : describeInstrumentType(payment.paymentMethodType),
    isRecurring: false,
    recurringInterval: null,
    goodsServicesProvided,
    goodsServicesFairMarketValueCents,
    recordedContributionAmountCents,
    acknowledgmentText,
    disclaimer: settings.disclaimer,
    footer: settings.footer,
  };

  const pdf = await renderToBuffer(DonationReceiptPdf(pdfProps));

  const subject = settings.subjectTemplate.replace(/\[Organization Name\]/gi, orgName);

  const lines: string[] = [];
  lines.push(`<p>Hi ${donorName},</p>`);
  if (settings.header) lines.push(`<p>${settings.header}</p>`);
  lines.push(`<p>Thank you for your gift of <strong>${formatCents(paymentAmountCents)}</strong> to <strong>${orgName}</strong>.</p>`);
  if (settings.showFund && payment.fundName) lines.push(`<p>Fund/Campaign: ${payment.fundName}</p>`);
  if (designationText) lines.push(`<p>Gift Purpose: ${designationText}</p>`);
  if (settings.showDonationReference) lines.push(`<p>Receipt Number: ${receiptNumber}</p>`);
  lines.push(`<p>${settings.thankYouMessage}</p>`);
  lines.push(`<p>${acknowledgmentText}</p>`);
  if (goodsServicesProvided) {
    lines.push(`<p>Payment Amount: ${formatCents(paymentAmountCents)}<br/>Fair Market Value: ${formatCents(goodsServicesFairMarketValueCents ?? 0)}<br/>Recorded Contribution Amount: ${formatCents(recordedContributionAmountCents)}</p>`);
  }
  if (settings.footer) lines.push(`<p style="font-size:12px;color:#64748b;">${settings.footer}</p>`);
  lines.push(`<p style="font-size:11px;color:#94a3b8;">${settings.disclaimer}</p>`);

  // Version this receipt: supersede whatever was the current (non-superseded)
  // version for this payment before creating the new one.
  const latest = await prisma.donationReceipt.findFirst({ where: { paymentId }, orderBy: { version: "desc" } });
  const nextVersion = latest ? latest.version + 1 : 1;
  if (latest && !latest.supersededAt) {
    await prisma.donationReceipt.update({ where: { id: latest.id }, data: { supersededAt: new Date() } });
  }

  const result = await sendWgcEmail({
    to: donorEmail,
    subject,
    title: "Thank You for Your Gift",
    badgeText: "Receipt",
    badgeColor: "#10B981",
    bodyHtml: lines.join("\n"),
    attachments: [{ filename: `receipt-${receiptNumber}${nextVersion > 1 ? `-v${nextVersion}` : ""}.pdf`, content: pdf as unknown as Buffer }],
  });

  await prisma.donationReceipt.create({
    data: {
      paymentId,
      churchId,
      version: nextVersion,
      receiptNumber,
      paymentAmountCentsSnapshot: paymentAmountCents,
      goodsServicesProvidedSnapshot: goodsServicesProvided,
      goodsServicesDescriptionSnapshot: goodsServicesDescription,
      goodsServicesFairMarketValueCentsSnapshot: goodsServicesFairMarketValueCents,
      recordedContributionAmountCentsSnapshot: recordedContributionAmountCents,
      acknowledgmentTextSnapshot: acknowledgmentText,
      recipientEmail: donorEmail,
      sentAt: result.success ? new Date() : null,
      failureReason: result.success ? null : String((result as any).error ?? "Email send failed"),
      createdByUserId: actorUserId,
    },
  });

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      receiptNumber,
      receiptStatus: result.success ? "SENT" : "FAILED",
      receiptSentAt: result.success ? new Date() : payment.receiptSentAt,
      recordedContributionAmountCents,
    },
  });

  await logDashboardAction({
    churchId,
    actorUserId,
    action: nextVersion > 1 ? "giving.donation_receipt_corrected_and_resent" : "giving.donation_receipt_sent",
    entityType: "payment",
    entityId: paymentId,
    metadata: { receiptNumber, version: nextVersion, success: result.success, goodsServicesProvided },
  });

  if (!result.success) throw new Error("Failed to send donation receipt");
  return { receiptNumber, recipientEmail: donorEmail, version: nextVersion };
}
