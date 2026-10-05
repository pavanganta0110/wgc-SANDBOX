import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { checkAdminAuthRateLimit } from "@/lib/auth/adminAuthRateLimit";
import { completeAdminLogin } from "@/lib/auth/completeAdminLogin";
import { hashMfaCode, MFA_MAX_CODE_ATTEMPTS } from "@/lib/auth/mfaCode";
import { logOtpEvent } from "@/lib/auth/otpAuditLog";

/** Admin-side mirror of /api/merchant/login/mfa-verify — see that file for
 * the full rationale (opaque challengeId only, never a client-supplied
 * userId). Issues the admin session cookie via completeAdminLogin on
 * success rather than completeMerchantLogin. */
export async function POST(req: Request) {
  try {
    const { challengeId, code } = await req.json();
    if (!challengeId || !code) {
      return NextResponse.json({ error: "Missing verification code." }, { status: 400 });
    }

    const headerList = await headers();
    const ip = headerList.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
    const userAgent = headerList.get("user-agent");
    if (!checkAdminAuthRateLimit(`admin-mfa-verify:${ip}`)) {
      return NextResponse.json({ error: "Too many attempts. Please try again in a minute." }, { status: 429 });
    }

    const user = await prisma.user.findFirst({
      where: { mfaLoginChallengeId: challengeId, role: { in: ["wgc_admin", "wgc_super_admin"] } },
    });
    if (!user || !user.mfaCodeHash || !user.mfaCodeExpiresAt) {
      return NextResponse.json({ error: "This verification code has expired. Please log in again." }, { status: 400 });
    }
    if (user.mfaCodeExpiresAt < new Date()) {
      await clearMfaChallenge(user.id);
      await logOtpEvent({ action: "OTP_EXPIRED", userId: user.id, actorEmail: user.email, ipAddress: ip, userAgent, metadata: { purpose: "ADMIN_LOGIN" } });
      return NextResponse.json({ error: "This verification code has expired. Please log in again." }, { status: 400 });
    }
    if (user.mfaCodeAttempts >= MFA_MAX_CODE_ATTEMPTS) {
      await clearMfaChallenge(user.id);
      await logOtpEvent({ action: "ADMIN_LOGIN_2FA_FAILED", userId: user.id, actorEmail: user.email, ipAddress: ip, userAgent, metadata: { reason: "MAX_ATTEMPTS" } });
      return NextResponse.json({ error: "Too many incorrect attempts. Please log in again to get a new code." }, { status: 400 });
    }

    if (hashMfaCode(String(code)) !== user.mfaCodeHash) {
      await prisma.user.update({ where: { id: user.id }, data: { mfaCodeAttempts: { increment: 1 } } });
      await logOtpEvent({ action: "OTP_FAILED", userId: user.id, actorEmail: user.email, ipAddress: ip, userAgent, metadata: { purpose: "ADMIN_LOGIN", stage: "VERIFY" } });
      return NextResponse.json({ error: "Incorrect code. Please try again." }, { status: 400 });
    }

    if (user.disabledAt) {
      return NextResponse.json({ error: "This account has been disabled." }, { status: 403 });
    }

    await clearMfaChallenge(user.id);
    // mfaVerified: true — this session is only issued here, after the
    // code was checked above, so it's genuinely OTP-verified.
    await completeAdminLogin(user, ip, userAgent, true);
    await logOtpEvent({ action: "OTP_VERIFIED", userId: user.id, actorEmail: user.email, ipAddress: ip, userAgent, metadata: { purpose: "ADMIN_LOGIN" } });
    await logOtpEvent({ action: "ADMIN_LOGIN_2FA_SUCCESS", userId: user.id, actorEmail: user.email, ipAddress: ip, userAgent });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Admin MFA verification failed:", error);
    return NextResponse.json({ error: "Verification failed. Please try again." }, { status: 500 });
  }
}

async function clearMfaChallenge(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { mfaCodeHash: null, mfaCodeExpiresAt: null, mfaCodeAttempts: 0, mfaLoginChallengeId: null },
  });
}
