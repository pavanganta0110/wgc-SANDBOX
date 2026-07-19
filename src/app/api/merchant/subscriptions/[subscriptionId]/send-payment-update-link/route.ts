import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSubscriptionPermissions } from "@/lib/subscriptions/subscriptionPermissions";
import { resolveSubscriptionDisplayStatus, frequencyLabel } from "@/lib/subscriptions/subscriptionStatus";
import { generateSetupLinkToken } from "@/lib/subscriptions/setupLinkToken";
import { sendWgcEmail } from "@/lib/email";
import { formatCents } from "@/lib/format";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";

const DEFAULT_EXPIRY_DAYS = 7;

/** Sends a secure, expiring, single-use link the donor uses to provide a new payment method for this exact subscription — never exposes donor/org/subscription IDs in the URL, and completion (see /api/setup/[token]/complete) cancels this subscription and creates a replacement rather than mutating the existing Finix subscription in place. */
export async function POST(req: Request, { params }: { params: Promise<{ subscriptionId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getSubscriptionPermissions(auth.rawRole);
  if (!permissions.canSendPaymentUpdateLink) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const churchId = auth.churchId;
  const { subscriptionId } = await params;

  const subscription = await prisma.finixSubscription.findFirst({ where: { id: subscriptionId, churchId } });
  if (!subscription) return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
  if (!subscription.donorId) return NextResponse.json({ error: "This subscription has no linked donor" }, { status: 400 });

  const displayStatus = resolveSubscriptionDisplayStatus({ rawState: subscription.state, canceledAt: subscription.canceledAt, completedAt: subscription.completedAt });
  if (displayStatus !== "ACTIVE" && displayStatus !== "PAST_DUE") {
    return NextResponse.json({ error: "A payment update link can only be sent for an active or past-due subscription" }, { status: 400 });
  }

  const donor = await prisma.donor.findFirst({ where: { id: subscription.donorId, churchId } });
  if (!donor?.email) return NextResponse.json({ error: "This donor has no email on file" }, { status: 400 });

  const church = await prisma.church.findUnique({ where: { id: churchId } });
  if (!church) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

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
      createdByUserId: auth.userId,
      updateTargetFinixSubscriptionId: subscription.finixSubscriptionId,
    },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://wgcpayments.com";
  const setupUrl = `${appUrl}/setup/${token}`;

  const emailResult = await sendWgcEmail({
    to: donor.email,
    subject: `Update your payment method for ${church.name}`,
    title: "Update Your Payment Method",
    badgeText: "Action Requested",
    badgeColor: "#C99A2E",
    bodyHtml: `
      <p>${church.name} needs an updated payment method for your recurring donation of <strong>${formatCents(subscription.amountCents ?? 0)} — ${frequencyLabel(subscription.billingInterval)}</strong>.</p>
      <p><a href="${setupUrl}" style="display:inline-block;padding:12px 24px;background:#0f172a;color:#fff;border-radius:8px;text-decoration:none;">Update Payment Method</a></p>
      <p style="font-size:12px;color:#64748b;">This link expires on ${expiresAt.toLocaleDateString("en-US")} and can only be used once.</p>
    `,
  });

  await prisma.subscriptionSetupLink.update({
    where: { id: link.id },
    data: { status: emailResult.success ? "SENT" : "FAILED", sentAt: emailResult.success ? new Date() : null, failureReason: emailResult.success ? null : "Email delivery failed" },
  });

  await logDashboardAction({
    churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "subscription.payment_update_link_sent",
    entityType: "subscription",
    entityId: subscription.id,
    metadata: { donorEmail: donor.email },
    req,
  });

  if (!emailResult.success) {
    return NextResponse.json({ error: "Failed to send the payment update link email." }, { status: 502 });
  }

  return NextResponse.json({ link: { id: link.id, status: "SENT", expiresAt } });
}
