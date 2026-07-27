import { prisma } from "@/lib/prisma";
import { sendWgcEmail } from "@/lib/email";
import { RECEIPT_METHOD_LABELS, type ExternalPaymentMethod } from "@/lib/donations/externalDonationTypes";

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Sends a receipt for an external (non-WGC-processed) donation. Per spec,
 * never includes: internal notes, the proof-of-payment attachment, full
 * external account information, provider credentials, or the provider fee
 * (provider fee is internal bookkeeping only, never shown to the donor).
 */
export async function sendExternalDonationReceiptEmail(externalDonationId: string, churchId: string, actorUserId: string | null = null) {
  const donation = await prisma.externalDonation.findFirst({ where: { id: externalDonationId, churchId } });
  if (!donation) throw new Error("External donation not found");
  if (donation.isAnonymous || !donation.donorId) throw new Error("Cannot send a receipt for an anonymous or unmatched donation");

  const [church, donor] = await Promise.all([
    prisma.church.findUnique({ where: { id: churchId } }),
    prisma.donor.findUnique({ where: { id: donation.donorId } }),
  ]);
  if (!church) throw new Error("Organization not found");
  if (!donor?.email) throw new Error("Donor is missing an email address — receipt not sent");

  const methodLabel = RECEIPT_METHOD_LABELS[donation.paymentMethod as ExternalPaymentMethod] || donation.otherPaymentMethodName || "Other";

  const bodyHtml = `
    <p>Hi ${donor.name || "there"},</p>
    <p>Thank you for your gift to ${church.name}. This confirms receipt of your donation:</p>
    <table style="width: 100%; margin: 20px 0; border-collapse: collapse;">
      <tr><td style="padding: 6px 0; color: #64748B;">Date</td><td style="padding: 6px 0; text-align: right;">${donation.donationDate.toLocaleDateString()}</td></tr>
      <tr><td style="padding: 6px 0; color: #64748B;">Amount</td><td style="padding: 6px 0; text-align: right;">${formatCents(donation.donationAmountCents)}</td></tr>
      <tr><td style="padding: 6px 0; color: #64748B;">Payment Method</td><td style="padding: 6px 0; text-align: right;">${methodLabel}</td></tr>
      ${donation.fundName ? `<tr><td style="padding: 6px 0; color: #64748B;">Fund</td><td style="padding: 6px 0; text-align: right;">${donation.fundName}</td></tr>` : ""}
    </table>
    <p>No goods or services were provided in exchange for this contribution unless separately noted.</p>
  `;

  const result = await sendWgcEmail({
    to: donor.email,
    subject: `Donation receipt — ${church.name}`,
    title: church.name,
    previewText: `Receipt for your ${formatCents(donation.donationAmountCents)} gift`,
    bodyHtml,
  });

  await prisma.externalDonation.update({
    where: { id: externalDonationId },
    data: {
      receiptStatus: result.success ? "SENT" : "FAILED",
      receiptSentAt: result.success ? new Date() : donation.receiptSentAt,
    },
  });

  await prisma.externalDonationAuditLog.create({
    data: {
      externalDonationId,
      action: result.success ? "RECEIPT_SENT" : "RECEIPT_FAILED",
      performedByUserId: actorUserId,
    },
  });

  return result;
}
