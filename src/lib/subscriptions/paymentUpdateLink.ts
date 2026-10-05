import { prisma } from "@/lib/prisma";
import { generateSetupLinkToken } from "@/lib/subscriptions/setupLinkToken";
import { frequencyLabel } from "@/lib/subscriptions/subscriptionStatus";
import { sendWgcEmail } from "@/lib/email";
import { formatCents } from "@/lib/format";

const DEFAULT_EXPIRY_DAYS = 7;

export interface SendPaymentUpdateLinkParams {
  churchId: string;
  churchName: string;
  subscription: {
    id: string;
    finixSubscriptionId: string;
    amountCents: number | null;
    billingInterval: string | null;
    fundId: string | null;
  };
  donor: { id: string; email: string };
  createdByUserId: string | null;
}

export interface SendPaymentUpdateLinkResult {
  success: boolean;
  linkId: string;
  expiresAt: Date;
}

/**
 * Creates a secure, expiring, single-use setup link and emails it to the
 * donor — the one and only place this flow is implemented. Shared by the
 * merchant's manual "Send Payment Update Link" action and the automatic
 * recovery trigger (recoveryAutomation.ts) so there is exactly one code
 * path to audit for this donor-facing, payment-adjacent email.
 */
export async function sendSubscriptionPaymentUpdateLink(params: SendPaymentUpdateLinkParams): Promise<SendPaymentUpdateLinkResult> {
  const { churchId, churchName, subscription, donor, createdByUserId } = params;
  const { token, tokenHash } = generateSetupLinkToken();
  const expiresAt = new Date(Date.now() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const link = await prisma.subscriptionSetupLink.create({
    data: {
      churchId,
      donorId: donor.id,
      donorFirstName: null,
      donorLastName: null,
      donorEmail: donor.email,
      tokenHash,
      amountCents: subscription.amountCents ?? 0,
      billingInterval: subscription.billingInterval ?? "MONTHLY",
      startDate: new Date(),
      fundId: subscription.fundId,
      status: "PENDING",
      expiresAt,
      createdByUserId,
      updateTargetFinixSubscriptionId: subscription.finixSubscriptionId,
    },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.wgcpayments.com";
  const setupUrl = `${appUrl}/setup/${token}`;

  const emailResult = await sendWgcEmail({
    to: donor.email,
    subject: `Update your payment method for ${churchName}`,
    title: "Update Your Payment Method",
    badgeText: "Action Requested",
    badgeColor: "#C99A2E",
    bodyHtml: `
      <p>${churchName} needs an updated payment method for your recurring donation of <strong>${formatCents(subscription.amountCents ?? 0)} — ${frequencyLabel(subscription.billingInterval)}</strong>.</p>
      <p><a href="${setupUrl}" style="display:inline-block;padding:12px 24px;background:#0f172a;color:#fff;border-radius:8px;text-decoration:none;">Update Payment Method</a></p>
      <p style="font-size:12px;color:#64748b;">This link expires on ${expiresAt.toLocaleDateString("en-US")} and can only be used once.</p>
    `,
  });

  await prisma.subscriptionSetupLink.update({
    where: { id: link.id },
    data: { status: emailResult.success ? "SENT" : "FAILED", sentAt: emailResult.success ? new Date() : null, failureReason: emailResult.success ? null : "Email delivery failed" },
  });

  return { success: emailResult.success, linkId: link.id, expiresAt };
}
