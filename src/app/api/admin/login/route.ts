import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { checkAdminAuthRateLimit } from "@/lib/auth/adminAuthRateLimit";
import { isAdminMfaEnforced } from "@/lib/auth/adminMfaPolicy";
import { completeAdminLogin } from "@/lib/auth/completeAdminLogin";
import { generateMfaCode, generateMfaChallengeId, maskPhone, MFA_CODE_TTL_MINUTES } from "@/lib/auth/mfaCode";
import { sendAuthSms } from "@/lib/sms/authSmsSender";
import { checkOtpSendLimits, recordOtpSend, otpSendLimitMessage } from "@/lib/auth/otpSendLimits";
import { logOtpEvent } from "@/lib/auth/otpAuditLog";

const GENERIC_ERROR = "Unable to sign in with those credentials.";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
    }

    const headerList = await headers();
    const ip = headerList.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
    const userAgent = headerList.get("user-agent");
    if (!checkAdminAuthRateLimit(`admin-login:${ip}`)) {
      return NextResponse.json({ error: "Too many attempts. Please try again in a minute." }, { status: 429 });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    const logFailure = () =>
      prisma.auditLog.create({
        data: { action: "LOGIN_FAILED", actorEmail: normalizedEmail, ipAddress: ip, userAgent },
      });

    // Same generic error for every failure mode — never reveals whether
    // the email exists, whether it's an admin account, or whether it's
    // disabled.
    if (!user || (user.role !== "wgc_admin" && user.role !== "wgc_super_admin") || !user.passwordHash || user.disabledAt) {
      await logFailure();
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      await logFailure();
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    // MFA mandatory once enrolled — password-verified admins with
    // mfaEnabled still complete a second OTP step before a session is
    // issued. An admin who hasn't enrolled yet still gets a session (see
    // below), but src/app/admin/(dashboard)/layout.tsx blocks all
    // dashboard functionality until they do — a safe rollout, not a
    // permanent lockout of existing admins.
    // Sandbox/staging only (never live — see adminMfaPolicy.ts): with
    // enforcement switched off, a correct password completes the login and
    // the session counts as verified, since no SMS provider is configured.
    if (!isAdminMfaEnforced()) {
      await completeAdminLogin(user, ip, userAgent, true);
      return NextResponse.json({ success: true });
    }

    if (user.mfaEnabled) {
      if (!user.phone) {
        console.error(`Admin MFA enabled with no phone on file for user ${user.id}`);
        return NextResponse.json({ error: "Two-factor setup is incomplete on this account. Contact engineering." }, { status: 500 });
      }

      const limitCheck = await checkOtpSendLimits({ userId: user.id, phone: user.phone, ipAddress: ip });
      if (!limitCheck.allowed) {
        await logOtpEvent({ action: "OTP_RATE_LIMITED", userId: user.id, actorEmail: user.email, ipAddress: ip, userAgent, metadata: { reason: limitCheck.reason, purpose: "ADMIN_LOGIN" } });
        return NextResponse.json({ error: otpSendLimitMessage(limitCheck) }, { status: 429 });
      }

      const { code, codeHash } = generateMfaCode();
      const challengeId = generateMfaChallengeId();
      await prisma.user.update({
        where: { id: user.id },
        data: {
          mfaCodeHash: codeHash,
          mfaCodeExpiresAt: new Date(Date.now() + MFA_CODE_TTL_MINUTES * 60 * 1000),
          mfaCodeAttempts: 0,
          mfaLoginChallengeId: challengeId,
        },
      });

      const smsResult = await sendAuthSms(user.phone, `Your WGC admin verification code is ${code}. It expires in ${MFA_CODE_TTL_MINUTES} minutes.`);
      await recordOtpSend({ userId: user.id, phone: user.phone, purpose: "ADMIN_LOGIN", ipAddress: ip, providerMessageId: smsResult.providerMessageId });

      if (!smsResult.success) {
        console.error(`Failed to send admin MFA login code to user ${user.id}:`, smsResult.error);
        await logOtpEvent({ action: "OTP_FAILED", userId: user.id, actorEmail: user.email, ipAddress: ip, userAgent, metadata: { purpose: "ADMIN_LOGIN", stage: "SEND" } });
        return NextResponse.json({ error: "Couldn't send your verification code. Please try again in a moment." }, { status: 502 });
      }

      await logOtpEvent({ action: "OTP_SENT", userId: user.id, actorEmail: user.email, ipAddress: ip, userAgent, metadata: { purpose: "ADMIN_LOGIN" } });
      return NextResponse.json({ mfaRequired: true, challengeId, maskedPhone: maskPhone(user.phone) });
    }

    // mfaVerified: false — this branch only runs when user.mfaEnabled is
    // false, i.e. no OTP step happened. The dashboard layout's enrollment
    // redirect handles routing this admin to /admin/mfa-setup; once they
    // complete it, THIS session still stays mfaVerified: false (see
    // SessionPayload.mfaVerified's comment) — they'll get a fresh,
    // properly-verified session on their next login.
    await completeAdminLogin(user, ip, userAgent, false);
    return NextResponse.json({ success: true, mfaSetupRequired: true });
  } catch (error) {
    console.error("Admin login failed:", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
