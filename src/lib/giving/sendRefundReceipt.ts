import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import { sendWgcEmail } from "@/lib/email";
import { publicOrgName } from "@/lib/settings/orgDisplayName";
import { resolveReceiptSettings } from "@/lib/settings/receiptDefaults";

/**
 * Emails the donor a plain-language confirmation that a refund was issued.
 * Works for any refund on the organization's payments, including ones issued by
 * WGC support in the processing dashboard. Never touches money: it only reads
 * the refund and sends an email.
 */
/** Everything a refund receipt shows. Shared by the emailed receipt and the page merchants can view and print. */
export async function loadRefundReceiptData(finixReversalId: string, churchId: string) {
  const refund = await prisma.finixRefundOrReversal.findFirst({ where: { finixReversalId, churchId } });
  if (!refund) throw new Error("Refund not found");

  const state = (refund.state || "").toUpperCase();
  if (state === "FAILED" || state === "CANCELED") throw new Error("This refund did not go through, so there is no receipt.");

  const church = await prisma.church.findUnique({ where: { id: churchId } });
  if (!church) throw new Error("Organization not found");

  const transfer = refund.finixOriginalTransferId
    ? await prisma.finixTransfer.findUnique({ where: { finixTransferId: refund.finixOriginalTransferId } })
    : null;
  const payment = refund.finixOriginalTransferId
    ? await prisma.payment.findFirst({ where: { finixTransferId: refund.finixOriginalTransferId, churchId } })
    : null;
  const instrument = transfer?.finixPaymentInstrumentId
    ? await prisma.finixPaymentInstrumentSnapshot.findUnique({ where: { finixPaymentInstrumentId: transfer.finixPaymentInstrumentId } })
    : null;
  const donorId = payment?.donorId ?? instrument?.donorId ?? null;
  const donor = donorId ? await prisma.donor.findUnique({ where: { id: donorId } }) : null;

  // Same branding and contact details the organization chose for its donation receipts
  // (Settings -> Receipts): logo, header/footer text, and which contact lines to show.
  const settings = resolveReceiptSettings(church);
  const address = church.addressLine1
    ? [church.addressLine1, church.addressLine2, [church.city, church.state, church.postalCode].filter(Boolean).join(", ")].filter(Boolean).join(", ")
    : null;
  const contact = {
    address: settings.showAddress ? address : null,
    email: settings.showEmail ? church.supportEmail || church.primaryContactEmail || null : null,
    phone: settings.showPhone ? church.phone || null : null,
    website: settings.showWebsite ? church.website || null : null,
    taxId: settings.showTaxId ? church.taxId || null : null,
  };

  return {
    state,
    church,
    settings,
    contact,
    logoUrl: church.logoUrl || null,
    donorId,
    donorEmail: donor?.email || null,
    donorName: donor?.name?.trim() || instrument?.accountHolderName?.trim() || "there",
    orgName: publicOrgName(church),
    refundCents: refund.amountCents ?? 0,
    originalCents: transfer?.amountCents ?? null,
    method: !settings.showPaymentMethodLastFour
      ? "the original payment method"
      : instrument?.cardBrand
        ? `${instrument.cardBrand} ending in ${instrument.cardLast4 ?? "----"}`
        : instrument?.bankLast4
          ? `bank account ending in ${instrument.bankLast4}`
          : "the original payment method",
    refundDate: (refund.createdAtFinix ?? new Date()).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Chicago" }),
    reference: refund.finixReversalId.slice(-8).toUpperCase(),
    reversalId: refund.finixReversalId,
  };
}

export async function sendRefundReceipt(
  finixReversalId: string,
  churchId: string,
  actorUserId: string | null = null,
  additionalRecipients: string[] = []
): Promise<{ sentTo: string }> {
  const d = await loadRefundReceiptData(finixReversalId, churchId);
  const { state, church, donorId, donorName, orgName, refundCents, originalCents, method, refundDate, reference } = d;

  const extra = additionalRecipients.map((e) => e.trim()).filter(Boolean);
  if (!d.donorEmail && extra.length === 0) throw new Error("This donor has no email address on file. Enter one to send the receipt.");
  const toEmail = d.donorEmail ?? extra[0];
  const ccEmails = d.donorEmail ? extra : extra.slice(1);

  const lines: string[] = [];
  lines.push(`<p>Hi ${donorName},</p>`);
  if (d.settings.header) lines.push(`<p>${d.settings.header}</p>`);
  lines.push(
    state === "SUCCEEDED"
      ? `<p>A refund of <strong>${formatCents(refundCents)}</strong> has been issued to ${method}${originalCents != null ? ` for your payment of <strong>${formatCents(originalCents)}</strong> to <strong>${orgName}</strong>` : ` by <strong>${orgName}</strong>`}.</p>`
      : `<p>A refund of <strong>${formatCents(refundCents)}</strong> to ${method} is being processed${originalCents != null ? ` for your payment of <strong>${formatCents(originalCents)}</strong> to <strong>${orgName}</strong>` : ` by <strong>${orgName}</strong>`}.</p>`
  );
  lines.push(`<p>Refund date: ${refundDate}<br/>Refund reference: ${reference}</p>`);
  lines.push(`<p>It can take 5 to 10 business days for the refund to appear on your card or bank statement, depending on your bank.</p>`);
  lines.push(`<p>If you have questions, please contact ${orgName} directly.</p>`);
  const contactBits = [d.contact.address, d.contact.email, d.contact.phone, d.contact.website].filter(Boolean);
  if (contactBits.length) lines.push(`<p style="font-size:12px;color:#64748b;">${orgName}<br/>${contactBits.join("<br/>")}</p>`);
  if (d.settings.footer) lines.push(`<p style="font-size:12px;color:#64748b;">${d.settings.footer}</p>`);

  const result = await sendWgcEmail({
    to: toEmail,
    cc: ccEmails,
    subject: `Your refund from ${orgName}`,
    title: "Refund Confirmation",
    badgeText: "Refund",
    badgeColor: "#6366F1",
    logoUrl: church.logoUrl || undefined,
    logoAlt: orgName,
    senderName: orgName,
    ...(d.settings.replyToEmail ? { replyTo: d.settings.replyToEmail } : {}),
    bodyHtml: lines.join("\n"),
    log: {
      churchId,
      donorId,
      recipientName: donorName,
      category: "OTHER",
      relatedEntityType: "Refund",
      relatedEntityId: d.reversalId,
      createdByUserId: actorUserId,
    },
  });

  if (!result.success) throw new Error("The email could not be sent. Please try again.");
  return { sentTo: toEmail };
}
