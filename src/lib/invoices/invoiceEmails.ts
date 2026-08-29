import { prisma } from "@/lib/prisma";
import { sendWgcEmail } from "@/lib/email";
import { formatCents } from "@/lib/format";
import { resolveInvoiceBranding, applyInvoiceOverrides } from "./invoiceBranding";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://wgcpayments.com";

/**
 * Every invoice email is sent through the same shared WGC email wrapper
 * (generateWgcEmailHtml / sendWgcEmail) used for donation receipts, setup
 * links, and dispute notifications — this codebase does not maintain a
 * second, per-merchant-branded email system. Per-merchant branding (logo,
 * accent color, custom messages) is what the invoice page/PDF renders;
 * these emails link out to that branded experience rather than trying to
 * reproduce it inline.
 */

async function recordDelivery(params: {
  invoiceId: string;
  churchId: string;
  channel: "EMAIL" | "SMS";
  recipient: string;
  status: "SENT" | "FAILED";
  providerMessageId?: string | null;
  errorMessage?: string | null;
}) {
  await prisma.invoiceDelivery.create({
    data: {
      invoiceId: params.invoiceId,
      churchId: params.churchId,
      channel: params.channel,
      recipient: params.recipient,
      status: params.status,
      providerMessageId: params.providerMessageId ?? null,
      errorMessage: params.errorMessage ?? null,
      sentAt: params.status === "SENT" ? new Date() : null,
    },
  });
}

/**
 * The initial (or resent) invoice email — the primary way a client
 * receives their payment link. Returns whether delivery succeeded so the
 * caller (the /send route) can decide whether to actually flip the
 * invoice to SENT, per "the invoice itself only flips to SENT once
 * delivery actually succeeds."
 */
export async function sendInvoiceEmail(invoiceId: string, token: string): Promise<{ success: boolean; error?: string }> {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) return { success: false, error: "Invoice not found." };

  const client = await prisma.client.findUnique({ where: { id: invoice.clientId } });
  if (!client?.email) return { success: false, error: "Client has no email address." };

  const branding = applyInvoiceOverrides(await resolveInvoiceBranding(invoice.churchId), invoice);
  const payUrl = `${APP_URL}/invoice/${token}`;
  const orgName = branding.organizationDisplayName;

  // Attaches the same PDF (with the same pay-link QR code) the public page
  // and the merchant dashboard can generate — "consistency across
  // outputs" — built with this send's own fresh token rather than a second
  // regeneration, so it doesn't invalidate the link this same email uses.
  let pdfAttachment: { filename: string; content: Buffer }[] | undefined;
  try {
    const { generateInvoicePdf } = await import("./generateInvoicePdf");
    const pdf = await generateInvoicePdf(invoiceId, token);
    pdfAttachment = [{ filename: `invoice-${invoice.invoiceNumber}.pdf`, content: pdf }];
  } catch (err) {
    console.error("Failed to generate invoice PDF for email attachment:", err);
  }

  const result = await sendWgcEmail({
    to: client.email,
    subject: `Invoice ${invoice.invoiceNumber} from ${orgName} — ${formatCents(invoice.balanceCents)} due`,
    title: `You have a new invoice from ${orgName}`,
    badgeText: "Invoice",
    badgeColor: branding.accentColor,
    bodyHtml: `
      <p>Hi ${client.displayName},</p>
      <p>${orgName} has sent you invoice <strong>${invoice.invoiceNumber}</strong>${invoice.title ? ` — ${invoice.title}` : ""} for <strong>${formatCents(invoice.totalCents)}</strong>, due ${invoice.dueDate.toLocaleDateString("en-US")}.</p>
      ${branding.defaultMemo || invoice.clientMemo ? `<p>${invoice.clientMemo || branding.defaultMemo}</p>` : ""}
      <p style="text-align:center;margin:30px 0;">
        <a href="${payUrl}" style="display:inline-block;padding:14px 28px;background-color:#0B5DBC;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600;">View &amp; Pay Invoice</a>
      </p>
      <p style="font-size:13px;color:#8A94A6;">If the button doesn't work, copy and paste this link: ${payUrl}</p>
    `,
    attachments: pdfAttachment,
    log: {
      churchId: invoice.churchId,
      donorId: null,
      recipientName: client.displayName,
      category: "INVOICE",
      relatedEntityType: "Invoice",
      relatedEntityId: invoiceId,
    },
  });

  await recordDelivery({
    invoiceId,
    churchId: invoice.churchId,
    channel: "EMAIL",
    recipient: client.email,
    status: result.success ? "SENT" : "FAILED",
    providerMessageId: result.success ? (result.data as { id?: string } | undefined)?.id ?? null : null,
    errorMessage: result.success ? null : String(result.error ?? "Unknown error"),
  });

  return result.success ? { success: true } : { success: false, error: "Email delivery failed." };
}

/** Sent to the payer after any successful payment (Finix or offline) —
 * confirms the amount, method, and remaining balance. Never blocks the
 * caller's own success response; failures are swallowed and logged, same
 * as the existing donation-receipt send pattern. */
export async function sendInvoicePaymentReceiptEmail(invoiceId: string, paymentId: string) {
  try {
    const [invoice, payment] = await Promise.all([
      prisma.invoice.findUnique({ where: { id: invoiceId } }),
      prisma.invoicePayment.findUnique({ where: { id: paymentId } }),
    ]);
    if (!invoice || !payment) return;

    const client = await prisma.client.findUnique({ where: { id: invoice.clientId } });
    if (!client?.email) return;

    const branding = applyInvoiceOverrides(await resolveInvoiceBranding(invoice.churchId), invoice);
    const orgName = branding.organizationDisplayName;

    // Attaches the current invoice PDF (payments section included) as the
    // receipt record — no fresh raw token is available at this point (see
    // sendInvoiceEmail's comment on why tokens are never persisted for
    // reuse), so this renders without the pay-online QR code, same as a
    // merchant re-downloading a PDF after the original send.
    let pdfAttachment: { filename: string; content: Buffer }[] | undefined;
    try {
      const { generateInvoicePdf } = await import("./generateInvoicePdf");
      const pdf = await generateInvoicePdf(invoiceId);
      pdfAttachment = [{ filename: `invoice-${invoice.invoiceNumber}-receipt.pdf`, content: pdf }];
    } catch (err) {
      console.error("Failed to generate invoice PDF for receipt email attachment:", err);
    }

    await sendWgcEmail({
      to: client.email,
      subject: `Payment received — Invoice ${invoice.invoiceNumber}`,
      title: "Payment Received",
      badgeText: "Receipt",
      badgeColor: "#10B981",
      bodyHtml: `
        <p>Hi ${client.displayName},</p>
        <p>${orgName} has received your payment of <strong>${formatCents(payment.grossAmountCents)}</strong> (${payment.method.replace(/_/g, " ")}) toward invoice <strong>${invoice.invoiceNumber}</strong>.</p>
        ${
          payment.customerCoveredFee && payment.feeContributionCents > 0
            ? `<p>Processing fee contribution: <strong>${formatCents(payment.feeContributionCents)}</strong><br/>Total charged: <strong>${formatCents(payment.totalChargedCents)}</strong></p>`
            : ""
        }
        <p>Remaining balance: <strong>${formatCents(invoice.balanceCents)}</strong>.</p>
        ${branding.thankYouMessage ? `<p>${branding.thankYouMessage}</p>` : ""}
      `,
      attachments: pdfAttachment,
      log: {
        churchId: invoice.churchId,
        donorId: null,
        recipientName: client.displayName,
        category: "INVOICE",
        relatedEntityType: "InvoicePayment",
        relatedEntityId: paymentId,
      },
    });
  } catch (err) {
    console.error("Failed to send invoice payment receipt email:", err);
  }
}

/** Reminder email (BEFORE_DUE / ON_DUE / AFTER_DUE / MANUAL) — see
 * invoiceReminders.ts for the scheduling logic that calls this. */
export async function sendInvoiceReminderEmail(invoiceId: string, token: string, reminderType: string): Promise<{ success: boolean }> {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) return { success: false };
  const client = await prisma.client.findUnique({ where: { id: invoice.clientId } });
  if (!client?.email) return { success: false };

  const branding = applyInvoiceOverrides(await resolveInvoiceBranding(invoice.churchId), invoice);
  const payUrl = `${APP_URL}/invoice/${token}`;
  const orgName = branding.organizationDisplayName;

  const isOverdue = reminderType === "AFTER_DUE";
  const title = isOverdue ? `Invoice ${invoice.invoiceNumber} is past due` : `Reminder: Invoice ${invoice.invoiceNumber} is due soon`;

  const result = await sendWgcEmail({
    to: client.email,
    subject: `${isOverdue ? "Past due" : "Reminder"}: Invoice ${invoice.invoiceNumber} from ${orgName} — ${formatCents(invoice.balanceCents)} due`,
    title,
    badgeText: isOverdue ? "Past Due" : "Reminder",
    badgeColor: isOverdue ? "#DC2626" : "#C99A2E",
    bodyHtml: `
      <p>Hi ${client.displayName},</p>
      <p>This is a reminder that invoice <strong>${invoice.invoiceNumber}</strong> from ${orgName} for <strong>${formatCents(invoice.balanceCents)}</strong> ${isOverdue ? "was due" : "is due"} on ${invoice.dueDate.toLocaleDateString("en-US")}.</p>
      <p style="text-align:center;margin:30px 0;">
        <a href="${payUrl}" style="display:inline-block;padding:14px 28px;background-color:#0B5DBC;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600;">View &amp; Pay Invoice</a>
      </p>
    `,
    log: {
      churchId: invoice.churchId,
      donorId: null,
      recipientName: client.displayName,
      category: "INVOICE",
      relatedEntityType: "Invoice",
      relatedEntityId: invoiceId,
      isResend: reminderType === "MANUAL",
    },
  });

  await recordDelivery({
    invoiceId,
    churchId: invoice.churchId,
    channel: "EMAIL",
    recipient: client.email,
    status: result.success ? "SENT" : "FAILED",
    providerMessageId: result.success ? (result.data as { id?: string } | undefined)?.id ?? null : null,
    errorMessage: result.success ? null : String(result.error ?? "Unknown error"),
  });

  return { success: result.success };
}
