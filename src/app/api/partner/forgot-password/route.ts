import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { checkMerchantAuthRateLimit } from "@/lib/auth/merchantAuthRateLimit";
import { createPartnerPasswordReset, PARTNER_RESET_TTL_MINUTES } from "@/lib/partners/partnerAccounts";
import { sendWgcEmail } from "@/lib/email";
import { createAuditLog } from "@/lib/audit";

const GENERIC = { message: "If that email has a partner account, we've sent a link to reset the password." };

/**
 * Emails a password reset link to someone who has a partner account. The answer is the
 * same whether or not the email has one, so this can't be used to find out who does.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || email.length > 254) return NextResponse.json({ error: "Enter your email address." }, { status: 400 });

  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (!checkMerchantAuthRateLimit(`partner-forgot:ip:${ip}`) || !checkMerchantAuthRateLimit(`partner-forgot:email:${email}`)) {
    return NextResponse.json({ error: "Too many attempts. Please try again in a minute." }, { status: 429 });
  }

  try {
    const reset = await createPartnerPasswordReset(email);
    if (reset) {
      const link = `${process.env.NEXT_PUBLIC_APP_URL || "https://www.wgcpayments.com"}/partner/reset-password/${reset.rawToken}`;
      await sendWgcEmail({
        to: reset.email,
        subject: "Reset your WGC Payments partner password",
        title: "Reset your password",
        badgeText: "Password reset",
        badgeColor: "#0B5DBC",
        bodyHtml: `<p>Use the link below to choose a new password for your partner account.</p><p><a href="${link}">Reset my password</a></p><p>The link works once and expires in ${PARTNER_RESET_TTL_MINUTES} minutes. If you didn't ask for this, you can ignore this email.</p>`,
      });
      await createAuditLog({ action: "PARTNER_PASSWORD_RESET_REQUESTED", actorEmail: reset.email, ipAddress: ip });
    }
  } catch (err) {
    console.error("Partner password reset request failed:", err);
  }
  return NextResponse.json(GENERIC);
}
