import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getSubscriptionPermissions } from "@/lib/subscriptions/subscriptionPermissions";
import { SUPPORTED_SUBSCRIPTION_FREQUENCIES, frequencyLabel } from "@/lib/subscriptions/subscriptionStatus";
import { generateSetupLinkToken } from "@/lib/subscriptions/setupLinkToken";
import { sendWgcEmail } from "@/lib/email";
import { formatCents } from "@/lib/format";
import { isValidEmail } from "@/lib/donors/donorContact";
import { logDashboardAction } from "@/lib/dashboardAudit";

const DEFAULT_EXPIRY_DAYS = 14;

export async function GET(req: Request) {
  const session = await getSession();
  const permissions = getSubscriptionPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canView) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const links = await prisma.subscriptionSetupLink.findMany({
    where: { churchId: session.churchId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ links });
}

/** Flow 2 — Send Secure Setup Link. Only a token hash is ever stored; the raw token exists solely in the emailed URL and this single response. */
export async function POST(req: Request) {
  const session = await getSession();
  const permissions = getSubscriptionPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canCreate) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const churchId = session.churchId;

  const body = await req.json();
  const { donorId, donorFirstName, donorLastName, donorEmail, donorPhone, amountCents, billingInterval, startDate: startDateStr, endDate: endDateStr, fundId, message, expiresInDays } = body;

  if (!Number.isFinite(amountCents) || amountCents < 100) {
    return NextResponse.json({ error: "Please enter a valid recurring amount of at least $1.00" }, { status: 400 });
  }
  if (!SUPPORTED_SUBSCRIPTION_FREQUENCIES.includes(billingInterval)) {
    return NextResponse.json({ error: "Unsupported frequency" }, { status: 400 });
  }
  const startDate = startDateStr ? new Date(startDateStr) : null;
  if (!startDate || Number.isNaN(startDate.getTime())) {
    return NextResponse.json({ error: "Please provide a valid start date" }, { status: 400 });
  }
  const endDate = endDateStr ? new Date(endDateStr) : null;

  let resolvedEmail: string = donorEmail;
  let resolvedDonorId: string | null = null;

  if (donorId) {
    const donor = await prisma.donor.findFirst({ where: { id: donorId, churchId, archivedAt: null } });
    if (!donor) return NextResponse.json({ error: "Donor not found" }, { status: 404 });
    if (!donor.email) return NextResponse.json({ error: "This donor has no email on file" }, { status: 400 });
    resolvedDonorId = donor.id;
    resolvedEmail = donor.email;
  } else {
    if (!donorEmail || !isValidEmail(donorEmail)) {
      return NextResponse.json({ error: "Please provide a valid donor email" }, { status: 400 });
    }
    if (!donorFirstName || !donorLastName) {
      return NextResponse.json({ error: "Donor first and last name are required" }, { status: 400 });
    }
  }

  if (fundId) {
    const fund = await prisma.fund.findFirst({ where: { id: fundId, churchId } });
    if (!fund) return NextResponse.json({ error: "Fund not found" }, { status: 404 });
  }

  const church = await prisma.church.findUnique({ where: { id: churchId } });
  if (!church) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

  const { token, tokenHash } = generateSetupLinkToken();
  const expiresAt = new Date(Date.now() + (Number(expiresInDays) > 0 ? Number(expiresInDays) : DEFAULT_EXPIRY_DAYS) * 24 * 60 * 60 * 1000);

  const link = await prisma.subscriptionSetupLink.create({
    data: {
      churchId,
      donorId: resolvedDonorId,
      donorFirstName: donorFirstName || null,
      donorLastName: donorLastName || null,
      donorEmail: resolvedEmail,
      donorPhone: donorPhone || null,
      tokenHash,
      amountCents,
      billingInterval,
      startDate,
      endDate,
      fundId: fundId || null,
      message: message || null,
      status: "PENDING",
      expiresAt,
      createdByUserId: session.userId,
    },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://wgcpayments.com";
  const setupUrl = `${appUrl}/setup/${token}`;

  const emailResult = await sendWgcEmail({
    to: resolvedEmail,
    subject: `Set up your recurring donation to ${church.name}`,
    title: "Set Up Your Recurring Donation",
    badgeText: "Action Requested",
    badgeColor: "#C99A2E",
    bodyHtml: `
      <p>${church.name} has invited you to set up a recurring donation:</p>
      <p><strong>${formatCents(amountCents)} — ${frequencyLabel(billingInterval)}</strong>, starting ${startDate.toLocaleDateString("en-US")}</p>
      ${message ? `<p>${message}</p>` : ""}
      <p><a href="${setupUrl}" style="display:inline-block;padding:12px 24px;background:#0f172a;color:#fff;border-radius:8px;text-decoration:none;">Review and Set Up</a></p>
      <p style="font-size:12px;color:#64748b;">This link expires on ${expiresAt.toLocaleDateString("en-US")} and can only be used once.</p>
    `,
  });

  await prisma.subscriptionSetupLink.update({
    where: { id: link.id },
    data: { status: emailResult.success ? "SENT" : "FAILED", sentAt: emailResult.success ? new Date() : null, failureReason: emailResult.success ? null : "Email delivery failed" },
  });

  await logDashboardAction({
    churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "subscription.setup_link_sent",
    entityType: "subscription_setup_link",
    entityId: link.id,
    metadata: { donorEmail: resolvedEmail, amountCents, billingInterval },
    req,
  });

  if (!emailResult.success) {
    return NextResponse.json({ error: "Failed to send the setup link email. You can retry from the setup links list." }, { status: 502 });
  }

  return NextResponse.json({ link: { id: link.id, status: "SENT", expiresAt, donorEmail: resolvedEmail }, setupUrl });
}
