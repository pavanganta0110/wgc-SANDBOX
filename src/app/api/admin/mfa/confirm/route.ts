import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getAdminSession, setSessionCookie } from "@/lib/auth/session";
import { hashMfaCode, MFA_MAX_CODE_ATTEMPTS } from "@/lib/auth/mfaCode";
import { logOtpEvent } from "@/lib/auth/otpAuditLog";

/** Admin-side mirror of /api/merchant/settings/security/mfa/confirm. On
 * success, flips mfaEnabled true — the very next request through
 * getAdminSession() reflects that, and the dashboard layout's MFA gate
 * stops redirecting to /admin/mfa-setup. */
export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const userAgent = headerList.get("user-agent") || null;

  const body = await req.json().catch(() => ({}));
  const code = typeof body.code === "string" ? body.code : "";
  if (!code) {
    return NextResponse.json({ error: "Missing verification code." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user?.pendingPhone || !user.mfaCodeHash || !user.mfaCodeExpiresAt) {
    return NextResponse.json({ error: "No verification in progress. Please start over." }, { status: 400 });
  }
  if (user.mfaCodeExpiresAt < new Date()) {
    await clearPendingMfa(user.id);
    await logOtpEvent({ action: "OTP_EXPIRED", userId: session.userId, actorEmail: session.email, ipAddress: ip, userAgent, metadata: { purpose: "ADMIN_ENROLL" } });
    return NextResponse.json({ error: "This code has expired. Please start over." }, { status: 400 });
  }
  if (user.mfaCodeAttempts >= MFA_MAX_CODE_ATTEMPTS) {
    await clearPendingMfa(user.id);
    return NextResponse.json({ error: "Too many incorrect attempts. Please start over." }, { status: 400 });
  }

  if (hashMfaCode(code) !== user.mfaCodeHash) {
    await prisma.user.update({ where: { id: user.id }, data: { mfaCodeAttempts: { increment: 1 } } });
    await logOtpEvent({ action: "OTP_FAILED", userId: session.userId, actorEmail: session.email, ipAddress: ip, userAgent, metadata: { purpose: "ADMIN_ENROLL", stage: "VERIFY" } });
    return NextResponse.json({ error: "Incorrect code. Please try again." }, { status: 400 });
  }

  const wasAlreadyEnabled = user.mfaEnabled;

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      phone: user.pendingPhone,
      phoneVerifiedAt: new Date(),
      mfaEnabled: true,
      pendingPhone: null,
      mfaCodeHash: null,
      mfaCodeExpiresAt: null,
      mfaCodeAttempts: 0,
    },
  });

  // Reissue the session cookie as mfaVerified: true — this browser just
  // typed a real OTP, right now, as part of enrollment (or a phone
  // change), so it genuinely has completed MFA for this session. Without
  // this, an admin who just finished mandatory enrollment would be
  // immediately blocked from every MFA-gated route (impersonation,
  // refunds, etc.) until logging out and back in, purely because their
  // existing session was issued before mfaEnabled flipped true. This is
  // NOT the same as the case requireMfaVerifiedAdminSession() guards
  // against — a stale/stolen session becoming valid because MFA was
  // enabled in a DIFFERENT session — this is the one session that just
  // did the verifying.
  await setSessionCookie({
    userId: updatedUser.id,
    email: updatedUser.email,
    role: updatedUser.role as "wgc_super_admin" | "wgc_admin",
    churchId: null,
    passwordChangedAt: updatedUser.passwordChangedAt ? updatedUser.passwordChangedAt.getTime() : null,
    mfaVerified: true,
  });

  await logOtpEvent({ action: "OTP_VERIFIED", userId: session.userId, actorEmail: session.email, ipAddress: ip, userAgent, metadata: { purpose: "ADMIN_ENROLL" } });
  await logOtpEvent({ action: wasAlreadyEnabled ? "PHONE_CHANGED" : "ADMIN_MFA_ENABLED", userId: session.userId, actorEmail: session.email, ipAddress: ip, userAgent });

  return NextResponse.json({ success: true });
}

async function clearPendingMfa(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { pendingPhone: null, mfaCodeHash: null, mfaCodeExpiresAt: null, mfaCodeAttempts: 0 },
  });
}
