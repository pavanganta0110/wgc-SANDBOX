import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";
import { normalizeUSPhone } from "@/lib/validation";
import { generateMfaCode, MFA_CODE_TTL_MINUTES } from "@/lib/auth/mfaCode";
import { sendAuthSms, isAuthSmsConfigured } from "@/lib/sms/authSmsSender";
import { checkOtpSendLimits, recordOtpSend, otpSendLimitMessage } from "@/lib/auth/otpSendLimits";
import { logOtpEvent } from "@/lib/auth/otpAuditLog";
import { recordSmsConsentGranted } from "@/lib/auth/smsConsent";

/** Admin-side mirror of /api/merchant/settings/security/mfa/enroll —
 * deliberately reachable regardless of session.mfaEnabled (getAdminSession
 * doesn't gate on that itself, only the dashboard layout does), since this
 * IS the route that lets an unenrolled admin complete setup. Same explicit
 * consent requirement as the merchant flow — mandatory-for-admins doesn't
 * mean consent-optional. */
export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAuthSmsConfigured()) {
    return NextResponse.json({ error: "Two-factor authentication isn't available yet." }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const normalized = normalizeUSPhone(typeof body.phone === "string" ? body.phone : "");
  if (!normalized) {
    return NextResponse.json({ error: "Please enter a valid U.S. phone number." }, { status: 400 });
  }
  if (body.smsConsent !== true) {
    return NextResponse.json({ error: "You must agree to receive SMS verification codes to enable two-factor authentication." }, { status: 400 });
  }

  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const userAgent = headerList.get("user-agent") || null;

  const limitCheck = await checkOtpSendLimits({ userId: session.userId, phone: normalized, ipAddress: ip });
  if (!limitCheck.allowed) {
    await logOtpEvent({ action: "OTP_RATE_LIMITED", userId: session.userId, actorEmail: session.email, ipAddress: ip, userAgent, metadata: { reason: limitCheck.reason, purpose: "ADMIN_ENROLL" } });
    return NextResponse.json({ error: otpSendLimitMessage(limitCheck), retryAfterSeconds: limitCheck.retryAfterSeconds }, { status: 429 });
  }

  const { code, codeHash } = generateMfaCode();
  await prisma.user.update({
    where: { id: session.userId },
    data: {
      pendingPhone: normalized,
      mfaCodeHash: codeHash,
      mfaCodeExpiresAt: new Date(Date.now() + MFA_CODE_TTL_MINUTES * 60 * 1000),
      mfaCodeAttempts: 0,
    },
  });

  const result = await sendAuthSms(normalized, `Your WGC admin verification code is ${code}. It expires in ${MFA_CODE_TTL_MINUTES} minutes.`);
  await recordOtpSend({ userId: session.userId, phone: normalized, purpose: "ENROLL", ipAddress: ip, providerMessageId: result.providerMessageId });

  if (!result.success) {
    console.error(`Failed to send admin MFA enrollment code to user ${session.userId}:`, result.error);
    await logOtpEvent({ action: "OTP_FAILED", userId: session.userId, actorEmail: session.email, ipAddress: ip, userAgent, metadata: { purpose: "ADMIN_ENROLL", stage: "SEND" } });
    // Never surface result.error (raw Twilio error text) to the client —
    // see Priority 6's non-sensitive-failure-message requirement.
    return NextResponse.json({ error: "We couldn't deliver the verification code. Confirm your phone number or try again." }, { status: 502 });
  }

  await logOtpEvent({ action: "OTP_SENT", userId: session.userId, actorEmail: session.email, ipAddress: ip, userAgent, metadata: { purpose: "ADMIN_ENROLL" } });

  try {
    await recordSmsConsentGranted({ userId: session.userId, churchId: null, phone: normalized, source: "admin_mfa_setup" });
  } catch (err) {
    console.error(`Failed to record SMS consent for admin ${session.userId}:`, err);
  }

  return NextResponse.json({ success: true });
}
