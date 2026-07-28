import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";
import { sendWgcEmail, buildOnboardingStatusEmailContent } from "@/lib/email";

// Account/credential emails: re-derived from the current User row by email
// (`to`), since the original raw token was never persisted (only its
// hash) — resending always means issuing a fresh link, same as a normal
// forgot-password request.
const ACCOUNT_LINK_TYPES: Record<string, { subject: string; title: string; intro: string }> = {
  DASHBOARD_ACCESS: {
    subject: "Your WGC Payments dashboard access",
    title: "Set up your dashboard access",
    intro: "Your WGC Payments merchant dashboard is ready. Use the secure link below to set your password and log in.",
  },
  PASSWORD_RESET: {
    subject: "Reset your WGC Payments password",
    title: "Reset your password",
    intro: "We received a request to reset your WGC Payments dashboard password.",
  },
  TEAM_INVITE: {
    subject: "You've been invited to join WGC Payments",
    title: "You're invited",
    intro: "Use the secure link below to accept your invitation and set your password.",
  },
};

const ONBOARDING_STATUS_TYPES = new Set([
  "ONBOARDING_SUBMITTED",
  "APPROVED",
  "MORE_INFORMATION_REQUIRED",
  "ADDITIONAL_INFO_NEEDED",
  "REJECTED",
]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const log = await prisma.emailLog.findUnique({ where: { id } });
  if (!log) return NextResponse.json({ error: "Email log not found" }, { status: 404 });

  const isOnboardingStatusType = ONBOARDING_STATUS_TYPES.has(log.type) || log.type.startsWith("ADMIN_RESEND_");

  if (isOnboardingStatusType && log.onboardingApplicationId) {
    const app = await prisma.onboardingApplication.findUnique({ where: { id: log.onboardingApplicationId } });
    if (!app) return NextResponse.json({ error: "Application not found" }, { status: 404 });

    const { subject, title, badgeText, badgeColor, bodyHtml } = buildOnboardingStatusEmailContent(
      app.onboardingStatus,
      app.organizationName
    );
    const result = await sendWgcEmail({ to: app.contactEmail, subject, title, badgeText, badgeColor, bodyHtml });

    const newLog = await prisma.emailLog.create({
      data: {
        onboardingApplicationId: app.id,
        type: "ADMIN_RESEND_" + (app.onboardingStatus || "UNKNOWN"),
        to: app.contactEmail,
        subject,
        status: result.success ? "SENT" : "FAILED",
        sentAt: result.success ? new Date() : null,
        error: result.success ? null : String(result.error ?? "unknown error"),
      },
    });

    return result.success
      ? NextResponse.json({ success: true, log: newLog })
      : NextResponse.json({ error: "Failed to send email", log: newLog }, { status: 500 });
  }

  if (log.type in ACCOUNT_LINK_TYPES) {
    const user = await prisma.user.findUnique({ where: { email: log.to } });
    if (!user) return NextResponse.json({ error: "No account exists for this email anymore" }, { status: 404 });

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.user.update({
      where: { id: user.id },
      data: { setPasswordTokenHash: tokenHash, setPasswordTokenExpiresAt: expiresAt },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.wgcpayments.com";
    const link = `${appUrl}/merchant/set-password/${rawToken}`;
    const copy = ACCOUNT_LINK_TYPES[log.type];

    const result = await sendWgcEmail({
      to: user.email,
      subject: copy.subject,
      title: copy.title,
      badgeText: "Action Required",
      badgeColor: "#0B5DBC",
      bodyHtml: `<p>${copy.intro}</p>
                 <p><a href="${link}">Set your password</a></p>
                 <p>This link expires in 7 days.</p>`,
    });

    const newLog = await prisma.emailLog.create({
      data: {
        type: log.type,
        to: user.email,
        subject: copy.subject,
        status: result.success ? "SENT" : "FAILED",
        sentAt: result.success ? new Date() : null,
        error: result.success ? null : String(result.error ?? "unknown error"),
      },
    });

    return result.success
      ? NextResponse.json({ success: true, log: newLog })
      : NextResponse.json({ error: "Failed to send email", log: newLog }, { status: 500 });
  }

  return NextResponse.json({ error: "This email type can't be resent from here" }, { status: 400 });
}
