import { prisma } from "@/lib/prisma";
import { sendWgcEmail } from "@/lib/email";
import { formatCents } from "@/lib/format";

/**
 * Idempotent, period-scoped billing/promotion email sending — every send
 * goes through sendIdempotentBillingEmail(), which checks BillingEmailLog
 * for an existing successful send under the same idempotencyKey before
 * calling Resend, so a retried webhook, a duplicate cron tick, or a page
 * refresh can never send the same reminder/receipt twice.
 */

export type BillingEmailType =
  | "SUBSCRIPTION_ACTIVATION"
  | "TRIAL_ENDING_14_DAYS"
  | "TRIAL_ENDING_7_DAYS"
  | "TRIAL_ENDING_3_DAYS"
  | "FIRST_CHARGE_REMINDER"
  | "PAYMENT_RECEIPT"
  | "FAILED_PAYMENT"
  | "PAYMENT_METHOD_UPDATED"
  | "SUBSCRIPTION_CANCELED"
  | "INVOICE_USAGE_STATEMENT"
  | "INVOICE_FEE_RECEIPT";

export interface SendBillingEmailInput {
  organizationId: string;
  recipientEmail: string;
  emailType: BillingEmailType;
  idempotencyKey: string;
  relatedSubscriptionId?: string;
  relatedChargeId?: string;
  subject: string;
  title: string;
  badgeText?: string;
  badgeColor?: string;
  bodyHtml: string;
}

export async function sendIdempotentBillingEmail(input: SendBillingEmailInput): Promise<{ sent: boolean; reason?: string }> {
  const existing = await prisma.billingEmailLog.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing && existing.status === "SENT") {
    return { sent: false, reason: "already_sent" };
  }

  const log =
    existing ??
    (await prisma.billingEmailLog.create({
      data: {
        organizationId: input.organizationId,
        recipientEmail: input.recipientEmail,
        emailType: input.emailType,
        idempotencyKey: input.idempotencyKey,
        relatedSubscriptionId: input.relatedSubscriptionId,
        relatedChargeId: input.relatedChargeId,
        status: "PENDING",
      },
    }));

  const result = await sendWgcEmail({
    to: input.recipientEmail,
    subject: input.subject,
    title: input.title,
    badgeText: input.badgeText,
    badgeColor: input.badgeColor,
    bodyHtml: input.bodyHtml,
  });

  await prisma.billingEmailLog.update({
    where: { id: log.id },
    data:
      result.success && "data" in result
        ? { status: "SENT", sentAt: new Date(), providerMessageId: result.data?.id ?? null }
        : {
            status: "FAILED",
            failureReason: JSON.stringify("error" in result ? (result.error ?? "unknown") : "unknown"),
            resendCount: { increment: existing ? 1 : 0 },
          },
  });

  return { sent: result.success };
}

const SUPPORT_LINK = `<p style="margin-top:24px;">Questions? Contact <a href="mailto:${process.env.SUPPORT_EMAIL || "support@wgcpayments.com"}">WGC Payments Support</a>.</p>`;

export async function sendSubscriptionActivationEmail(params: {
  organizationId: string;
  organizationName: string;
  recipientEmail: string;
  activationUrl: string;
}) {
  return sendIdempotentBillingEmail({
    organizationId: params.organizationId,
    recipientEmail: params.recipientEmail,
    emailType: "SUBSCRIPTION_ACTIVATION",
    idempotencyKey: `${params.organizationId}:SUBSCRIPTION_ACTIVATION`,
    subject: "Action needed: activate your WGC Payments subscription",
    title: "Your account is approved — activate your subscription",
    badgeText: "Approved",
    badgeColor: "#10B981",
    bodyHtml: `
      <p>Hi ${params.organizationName},</p>
      <p>Great news — your WGC Payments merchant account has been approved by Finix.</p>
      <p>Before you can start processing, complete the last step: set up your WGC Platform subscription billing method.</p>
      <p><a href="${params.activationUrl}" style="display:inline-block;padding:12px 24px;background:#0B5DBC;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">Activate Subscription</a></p>
      ${SUPPORT_LINK}
    `,
  });
}

export async function sendActivationConfirmationEmail(params: {
  organizationId: string;
  organizationName: string;
  recipientEmail: string;
  isPromotional: boolean;
  trialEndsAt: Date | null;
  firstChargeAt: Date | null;
  amountCents: number;
}) {
  return sendIdempotentBillingEmail({
    organizationId: params.organizationId,
    recipientEmail: params.recipientEmail,
    emailType: params.isPromotional ? "SUBSCRIPTION_ACTIVATION" : "SUBSCRIPTION_ACTIVATION",
    idempotencyKey: `${params.organizationId}:SUBSCRIPTION_ACTIVATION_CONFIRMED`,
    subject: params.isPromotional ? "Your Six Months Free trial is now active" : "Your WGC Payments subscription is active",
    title: params.isPromotional ? "Your six-month free trial has started" : "Your subscription is active",
    badgeText: "Active",
    badgeColor: "#10B981",
    bodyHtml: `
      <p>Hi ${params.organizationName},</p>
      ${
        params.isPromotional
          ? `<p>Your WGC Platform subscription is now active with your Six Months Free promotion. Your platform fee is $0/month until ${params.trialEndsAt?.toLocaleDateString() ?? "your trial ends"}, when it automatically renews at ${formatCents(params.amountCents)}/month.</p>`
          : `<p>Your WGC Platform subscription is now active at ${formatCents(params.amountCents)}/month.</p>`
      }
      <p><strong>First charge date:</strong> ${params.firstChargeAt?.toLocaleDateString() ?? "—"}</p>
      ${SUPPORT_LINK}
    `,
  });
}

export async function sendTrialEndingReminderEmail(params: {
  organizationId: string;
  organizationName: string;
  recipientEmail: string;
  daysBefore: 14 | 7 | 3;
  firstChargeAt: Date;
  maskedBillingMethod: string;
  updatePaymentMethodUrl: string;
}) {
  const periodKey = params.firstChargeAt.toISOString().slice(0, 10);
  return sendIdempotentBillingEmail({
    organizationId: params.organizationId,
    recipientEmail: params.recipientEmail,
    emailType: `TRIAL_ENDING_${params.daysBefore}_DAYS` as BillingEmailType,
    idempotencyKey: `${params.organizationId}:TRIAL_ENDING_${params.daysBefore}_DAYS:${periodKey}`,
    subject: `Your WGC Payments free trial ends in ${params.daysBefore} days`,
    title: "Your promotional period is ending soon",
    badgeText: "Reminder",
    bodyHtml: `
      <p>Hi ${params.organizationName},</p>
      <p>Your Six Months Free promotional period ends soon. Your first $10 monthly WGC Platform charge is scheduled for <strong>${params.firstChargeAt.toLocaleDateString()}</strong>.</p>
      <p>Billing method on file: ${params.maskedBillingMethod}</p>
      <p><a href="${params.updatePaymentMethodUrl}">Update billing method</a></p>
      ${SUPPORT_LINK}
    `,
  });
}

export async function sendFirstChargeReminderEmail(params: {
  organizationId: string;
  organizationName: string;
  recipientEmail: string;
  firstChargeAt: Date;
}) {
  const periodKey = params.firstChargeAt.toISOString().slice(0, 10);
  return sendIdempotentBillingEmail({
    organizationId: params.organizationId,
    recipientEmail: params.recipientEmail,
    emailType: "FIRST_CHARGE_REMINDER",
    idempotencyKey: `${params.organizationId}:FIRST_CHARGE_REMINDER:${periodKey}`,
    subject: "Your first WGC Platform charge is coming up",
    title: "Your first $10 charge is scheduled",
    bodyHtml: `<p>Hi ${params.organizationName},</p><p>Your first $10/month WGC Platform charge will process on ${params.firstChargeAt.toLocaleDateString()}.</p>${SUPPORT_LINK}`,
  });
}

export async function sendPaymentReceiptEmail(params: {
  organizationId: string;
  organizationName: string;
  recipientEmail: string;
  chargeId: string;
  amountCents: number;
  chargedAt: Date;
  maskedBillingMethod: string;
}) {
  return sendIdempotentBillingEmail({
    organizationId: params.organizationId,
    recipientEmail: params.recipientEmail,
    emailType: "PAYMENT_RECEIPT",
    idempotencyKey: `${params.organizationId}:PAYMENT_RECEIPT:${params.chargeId}`,
    relatedChargeId: params.chargeId,
    subject: `Receipt: ${formatCents(params.amountCents)} WGC Payments subscription charge`,
    title: "Payment receipt",
    badgeText: "Paid",
    badgeColor: "#10B981",
    bodyHtml: `
      <p>Hi ${params.organizationName},</p>
      <p>We've successfully charged your WGC Platform subscription.</p>
      <p><strong>Amount:</strong> ${formatCents(params.amountCents)}<br/>
      <strong>Date:</strong> ${params.chargedAt.toLocaleDateString()}<br/>
      <strong>Billing method:</strong> ${params.maskedBillingMethod}</p>
      ${SUPPORT_LINK}
    `,
  });
}

export async function sendFailedPaymentEmail(params: {
  organizationId: string;
  organizationName: string;
  recipientEmail: string;
  chargeId: string;
  amountCents: number;
  failedAt: Date;
  gracePeriodEndsAt: Date | null;
  updatePaymentMethodUrl: string;
}) {
  return sendIdempotentBillingEmail({
    organizationId: params.organizationId,
    recipientEmail: params.recipientEmail,
    emailType: "FAILED_PAYMENT",
    idempotencyKey: `${params.organizationId}:FAILED_PAYMENT:${params.chargeId}`,
    relatedChargeId: params.chargeId,
    subject: "Action needed: your WGC Payments subscription payment failed",
    title: "Your subscription payment was unsuccessful",
    badgeText: "Payment Failed",
    badgeColor: "#DC2626",
    bodyHtml: `
      <p>Hi ${params.organizationName},</p>
      <p>We were unable to process your ${formatCents(params.amountCents)} WGC Platform subscription charge on ${params.failedAt.toLocaleDateString()}.</p>
      ${params.gracePeriodEndsAt ? `<p>Please update your billing method by <strong>${params.gracePeriodEndsAt.toLocaleDateString()}</strong> to avoid account restrictions.</p>` : ""}
      <p><a href="${params.updatePaymentMethodUrl}" style="display:inline-block;padding:12px 24px;background:#0B5DBC;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">Update Billing Method</a></p>
      ${SUPPORT_LINK}
    `,
  });
}

export async function sendCancellationConfirmationEmail(params: {
  organizationId: string;
  organizationName: string;
  recipientEmail: string;
  subscriptionId: string;
  effectiveAt: Date;
}) {
  return sendIdempotentBillingEmail({
    organizationId: params.organizationId,
    recipientEmail: params.recipientEmail,
    emailType: "SUBSCRIPTION_CANCELED",
    idempotencyKey: `${params.organizationId}:SUBSCRIPTION_CANCELED:${params.subscriptionId}`,
    relatedSubscriptionId: params.subscriptionId,
    subject: "Your WGC Payments subscription has been canceled",
    title: "Subscription canceled",
    bodyHtml: `
      <p>Hi ${params.organizationName},</p>
      <p>Your WGC Platform subscription has been canceled, effective ${params.effectiveAt.toLocaleDateString()}. No further charges will occur.</p>
      <p>All of your donation, donor, and financial history has been preserved.</p>
      ${SUPPORT_LINK}
    `,
  });
}
