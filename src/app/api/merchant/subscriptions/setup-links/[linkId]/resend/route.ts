import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getSubscriptionPermissions } from "@/lib/subscriptions/subscriptionPermissions";
import { generateSetupLinkToken } from "@/lib/subscriptions/setupLinkToken";
import { frequencyLabel } from "@/lib/subscriptions/subscriptionStatus";
import { sendWgcEmail } from "@/lib/email";
import { formatCents } from "@/lib/format";
import { logDashboardAction } from "@/lib/dashboardAudit";

const DEFAULT_EXPIRY_DAYS = 14;

/** Resending rotates the token (a new hash is stored, the old one is dead) rather than re-emailing the original — a link previously forwarded or intercepted stops working. */
export async function POST(req: Request, { params }: { params: Promise<{ linkId: string }> }) {
  const session = await getSession();
  const permissions = getSubscriptionPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canCreate) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { linkId } = await params;
  const link = await prisma.subscriptionSetupLink.findFirst({ where: { id: linkId, churchId: session.churchId } });
  if (!link) return NextResponse.json({ error: "Setup link not found" }, { status: 404 });
  if (link.status === "COMPLETED") return NextResponse.json({ error: "This setup link has already been completed" }, { status: 400 });
  if (link.status === "REVOKED") return NextResponse.json({ error: "This setup link has been revoked" }, { status: 400 });

  const church = await prisma.church.findUnique({ where: { id: session.churchId } });
  if (!church) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

  const { token, tokenHash } = generateSetupLinkToken();
  const expiresAt = new Date(Date.now() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://wgcpayments.com";
  const setupUrl = `${appUrl}/setup/${token}`;

  const emailResult = await sendWgcEmail({
    to: link.donorEmail,
    subject: `Set up your recurring donation to ${church.name}`,
    title: "Set Up Your Recurring Donation",
    badgeText: "Action Requested",
    badgeColor: "#C99A2E",
    bodyHtml: `
      <p>${church.name} has invited you to set up a recurring donation:</p>
      <p><strong>${formatCents(link.amountCents)} — ${frequencyLabel(link.billingInterval)}</strong></p>
      <p><a href="${setupUrl}" style="display:inline-block;padding:12px 24px;background:#0f172a;color:#fff;border-radius:8px;text-decoration:none;">Review and Set Up</a></p>
      <p style="font-size:12px;color:#64748b;">This link expires on ${expiresAt.toLocaleDateString("en-US")} and can only be used once.</p>
    `,
  });

  const updated = await prisma.subscriptionSetupLink.update({
    where: { id: link.id },
    data: {
      tokenHash,
      expiresAt,
      status: emailResult.success ? "SENT" : "FAILED",
      sentAt: emailResult.success ? new Date() : link.sentAt,
      failureReason: emailResult.success ? null : "Email delivery failed",
    },
  });

  await logDashboardAction({
    churchId: session.churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "subscription.setup_link_resent",
    entityType: "subscription_setup_link",
    entityId: link.id,
    req,
  });

  if (!emailResult.success) {
    return NextResponse.json({ error: "Failed to resend the setup link email." }, { status: 502 });
  }

  return NextResponse.json({ link: updated, setupUrl });
}
