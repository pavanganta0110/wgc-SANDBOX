import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { checkAdminAuthRateLimit } from "@/lib/auth/adminAuthRateLimit";
import { generateMfaCode, maskPhone, MFA_CODE_TTL_MINUTES } from "@/lib/auth/mfaCode";
import { sendAuthSms } from "@/lib/sms/authSmsSender";
import { checkOtpSendLimits, recordOtpSend, otpSendLimitMessage, OTP_RESEND_COOLDOWN_SECONDS } from "@/lib/auth/otpSendLimits";
import { logOtpEvent } from "@/lib/auth/otpAuditLog";

/** Admin-side mirror of /api/merchant/login/mfa-resend — same cooldown,
 * caps, and opaque-challenge-only handle. */
export async function POST(req: Request) {
  try {
    const { challengeId } = await req.json();
    if (!challengeId) {
      return NextResponse.json({ error: "Missing verification session." }, { status: 400 });
    }

    const headerList = await headers();
    const ip = headerList.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
    const userAgent = headerList.get("user-agent");
    if (!checkAdminAuthRateLimit(`admin-mfa-resend:${ip}`)) {
      return NextResponse.json({ error: "Too many attempts. Please try again in a minute." }, { status: 429 });
    }

    const user = await prisma.user.findFirst({
      where: { mfaLoginChallengeId: challengeId, role: { in: ["wgc_admin", "wgc_super_admin"] } },
    });
    if (!user || !user.mfaCodeHash || !user.mfaCodeExpiresAt || !user.phone) {
      return NextResponse.json({ error: "This verification session has expired. Please log in again." }, { status: 400 });
    }
    if (user.mfaCodeExpiresAt < new Date()) {
      return NextResponse.json({ error: "This verification session has expired. Please log in again." }, { status: 400 });
    }

    const limitCheck = await checkOtpSendLimits({ userId: user.id, phone: user.phone, ipAddress: ip });
    if (!limitCheck.allowed) {
      await logOtpEvent({ action: "OTP_RATE_LIMITED", userId: user.id, actorEmail: user.email, ipAddress: ip, userAgent, metadata: { reason: limitCheck.reason, purpose: "ADMIN_RESEND" } });
      return NextResponse.json({ error: otpSendLimitMessage(limitCheck), retryAfterSeconds: limitCheck.retryAfterSeconds }, { status: 429 });
    }

    const { code, codeHash } = generateMfaCode();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        mfaCodeHash: codeHash,
        mfaCodeExpiresAt: new Date(Date.now() + MFA_CODE_TTL_MINUTES * 60 * 1000),
        mfaCodeAttempts: 0,
      },
    });

    const smsResult = await sendAuthSms(user.phone, `Your WGC admin verification code is ${code}. It expires in ${MFA_CODE_TTL_MINUTES} minutes.`);
    await recordOtpSend({ userId: user.id, phone: user.phone, purpose: "ADMIN_RESEND", ipAddress: ip, providerMessageId: smsResult.providerMessageId });

    if (!smsResult.success) {
      console.error(`Failed to resend admin MFA login code to user ${user.id}:`, smsResult.error);
      await logOtpEvent({ action: "OTP_FAILED", userId: user.id, actorEmail: user.email, ipAddress: ip, userAgent, metadata: { purpose: "ADMIN_RESEND", stage: "SEND" } });
      return NextResponse.json({ error: "Couldn't resend your verification code. Please try again in a moment." }, { status: 502 });
    }

    await logOtpEvent({ action: "OTP_RESENT", userId: user.id, actorEmail: user.email, ipAddress: ip, userAgent, metadata: { purpose: "ADMIN_RESEND" } });
    return NextResponse.json({ success: true, maskedPhone: maskPhone(user.phone), cooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS });
  } catch (error) {
    console.error("Admin MFA resend failed:", error);
    return NextResponse.json({ error: "Failed to resend code. Please try again." }, { status: 500 });
  }
}
