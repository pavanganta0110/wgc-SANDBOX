import { prisma } from "@/lib/prisma";
import { getSmsProvider } from "@/lib/sms/smsProvider";
import { formatCents } from "@/lib/format";
import { resolveInvoiceBranding, applyInvoiceOverrides } from "./invoiceBranding";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://wgcpayments.com";

/**
 * Optional SMS reminder — off by default. The Client model has no SMS
 * consent field (see prisma/schema.prisma), and sending unsolicited
 * payment-reminder texts is a real TCPA compliance risk, so this only ever
 * fires when a church has explicitly opted in via
 * INVOICE_SMS_REMINDERS_ENABLED=true (set per-environment, not
 * per-church — there's no per-church toggle in InvoiceSettings either,
 * since the spec's InvoiceSettings model doesn't define one; adding one
 * would be a schema change beyond "SMS provider abstraction"). Every send
 * is recorded on InvoiceDelivery with channel: "SMS" regardless of
 * provider configuration, so a NoopSmsProvider failure is still visible in
 * the invoice's delivery history, not silently dropped.
 */
export async function sendInvoiceReminderSms(invoiceId: string, token: string, reminderType: string): Promise<{ attempted: boolean; success: boolean }> {
  if (process.env.INVOICE_SMS_REMINDERS_ENABLED !== "true") {
    return { attempted: false, success: false };
  }

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) return { attempted: false, success: false };

  const client = await prisma.client.findUnique({ where: { id: invoice.clientId } });
  if (!client?.phone) return { attempted: false, success: false };

  const branding = applyInvoiceOverrides(await resolveInvoiceBranding(invoice.churchId), invoice);
  const isOverdue = reminderType === "AFTER_DUE";
  const payUrl = `${APP_URL}/invoice/${token}`;
  const body = `${branding.organizationDisplayName}: Invoice ${invoice.invoiceNumber} for ${formatCents(invoice.balanceCents)} ${isOverdue ? "is past due" : `is due ${invoice.dueDate.toLocaleDateString("en-US")}`}. Pay: ${payUrl}`;

  const result = await getSmsProvider().send(client.phone, body);

  await prisma.invoiceDelivery.create({
    data: {
      invoiceId,
      churchId: invoice.churchId,
      channel: "SMS",
      recipient: client.phone,
      status: result.success ? "SENT" : "FAILED",
      providerMessageId: result.providerMessageId ?? null,
      errorMessage: result.error ?? null,
      sentAt: result.success ? new Date() : null,
    },
  });

  return { attempted: true, success: result.success };
}
