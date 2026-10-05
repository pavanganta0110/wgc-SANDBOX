import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { normalizeUSPhone } from "@/lib/validation";
import { generateMfaCode, MFA_CODE_TTL_MINUTES } from "@/lib/auth/mfaCode";
import { sendAuthSms, isAuthSmsConfigured } from "@/lib/sms/authSmsSender";
import { checkOtpSendLimits, recordOtpSend, otpSendLimitMessage } from "@/lib/auth/otpSendLimits";
import { logOtpEvent } from "@/lib/auth/otpAuditLog";
import { recordSmsConsentGranted } from "@/lib/auth/smsConsent";

/**
 * Step 1 of turning on SMS MFA: validate the phone, text it a code, and
 * hold the number as pendingPhone — it only becomes the account's real
 * phone/mfaEnabled=true once confirm/route.ts verifies the code. Never
 * flips mfaEnabled here; a wrong number entered by mistake must never
 * lock the account into requiring a code that can never arrive.
 */
export async function POST(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  // A WGC admin viewing a merchant via impersonation has auth.userId set
  // to their OWN real user id (see requireMerchantSession.ts's
  // impersonation branch) — proceeding here would enroll 2FA on the
  // ADMIN's account while the UI implies it's the merchant's. Personal
  // account-security settings are never available inside an impersonated
  // session.
  if (auth.impersonation) {
    return NextResponse.json({ error: "Personal account security settings aren't available while viewing as a merchant." }, { status: 403 });
  }

  if (!isAuthSmsConfigured()) {
    return NextResponse.json({ error: "Two-factor authentication isn't available yet." }, { status: 503 });
  }

  // Reauthentication gate — same pattern as change-password and the
  // financial-mutation routes. Turning MFA on/off is a security setting,
  // not a routine one.
  const now = Math.floor(Date.now() / 1000);
  if (!auth.authTime || now - auth.authTime > 600) {
    return NextResponse.json({ error: "Reauthentication required. Please log in again to verify your identity.", reauthRequired: true }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const normalized = normalizeUSPhone(typeof body.phone === "string" ? body.phone : "");
  if (!normalized) {
    return NextResponse.json({ error: "Please enter a valid U.S. phone number." }, { status: 400 });
  }
  // Server-side consent gate — never trust the button being disabled
  // client-side as the actual enforcement. A phone number alone is never
  // consent; the checkbox must have been explicitly checked.
  if (body.smsConsent !== true) {
    return NextResponse.json({ error: "You must agree to receive SMS verification codes to enable text-message two-factor authentication." }, { status: 400 });
  }

  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const userAgent = headerList.get("user-agent") || null;

  const limitCheck = await checkOtpSendLimits({ userId: auth.userId, phone: normalized, ipAddress: ip });
  if (!limitCheck.allowed) {
    await logOtpEvent({ action: "OTP_RATE_LIMITED", userId: auth.userId, churchId: auth.churchId, actorEmail: auth.email, ipAddress: ip, userAgent, metadata: { reason: limitCheck.reason, purpose: "ENROLL" } });
    return NextResponse.json({ error: otpSendLimitMessage(limitCheck), retryAfterSeconds: limitCheck.retryAfterSeconds }, { status: 429 });
  }

  const { code, codeHash } = generateMfaCode();
  await prisma.user.update({
    where: { id: auth.userId },
    data: {
      pendingPhone: normalized,
      mfaCodeHash: codeHash,
      mfaCodeExpiresAt: new Date(Date.now() + MFA_CODE_TTL_MINUTES * 60 * 1000),
      mfaCodeAttempts: 0,
    },
  });

  const result = await sendAuthSms(normalized, `Your WGC Payments verification code is ${code}. It expires in ${MFA_CODE_TTL_MINUTES} minutes.`);
  await recordOtpSend({ userId: auth.userId, phone: normalized, purpose: "ENROLL", ipAddress: ip, providerMessageId: result.providerMessageId });

  if (!result.success) {
    console.error(`Failed to send MFA enrollment code to user ${auth.userId}:`, result.error);
    await logOtpEvent({ action: "OTP_FAILED", userId: auth.userId, churchId: auth.churchId, actorEmail: auth.email, ipAddress: ip, userAgent, metadata: { purpose: "ENROLL", stage: "SEND" } });
    // Never surface result.error (raw Twilio error text) to the client —
    // see Priority 6's non-sensitive-failure-message requirement.
    return NextResponse.json({ error: "We couldn't deliver the verification code. Confirm your phone number or try again." }, { status: 502 });
  }

  await logOtpEvent({ action: "OTP_SENT", userId: auth.userId, churchId: auth.churchId, actorEmail: auth.email, ipAddress: ip, userAgent, metadata: { purpose: "ENROLL" } });

  // Recorded here, not at confirm — this enroll step is the moment consent
  // was validated and the first SMS actually went out. Never logs the
  // phone number itself.
  try {
    await recordSmsConsentGranted({ userId: auth.userId, churchId: auth.churchId ?? null, phone: normalized, source: "settings_security_mfa_enroll" });
  } catch (err) {
    console.error(`Failed to record SMS consent for user ${auth.userId}:`, err);
  }

  return NextResponse.json({ success: true });
}
