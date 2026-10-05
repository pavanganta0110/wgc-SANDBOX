import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { hashMfaCode, MFA_MAX_CODE_ATTEMPTS } from "@/lib/auth/mfaCode";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { logOtpEvent } from "@/lib/auth/otpAuditLog";

/**
 * Step 2 of turning on SMS MFA: verify the code sent to pendingPhone, then
 * — and only then — promote it to the real phone and flip mfaEnabled on.
 *
 * Also doubles as the "change phone number" confirmation step (Settings ->
 * Security -> Change Number reuses this same enroll/confirm pair, since
 * "verify a new number before trusting it" is identical logic whether MFA
 * was already on or this is first-time setup). We distinguish the two only
 * for audit purposes: if mfaEnabled was already true going in, this is a
 * PHONE_CHANGED event, not a fresh MFA_ENABLED — and critically, the OLD
 * verified phone number is never touched until this exact moment, so a
 * user changing numbers never has a window where MFA is silently disabled
 * or pointing at an unverified number.
 */
export async function POST(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  // See enroll/route.ts's comment — never let an impersonated session
  // confirm/mutate the impersonating ADMIN's own MFA/phone.
  if (auth.impersonation) {
    return NextResponse.json({ error: "Personal account security settings aren't available while viewing as a merchant." }, { status: 403 });
  }

  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const userAgent = headerList.get("user-agent") || null;

  const body = await req.json().catch(() => ({}));
  const code = typeof body.code === "string" ? body.code : "";
  if (!code) {
    return NextResponse.json({ error: "Missing verification code." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: auth.userId } });
  if (!user?.pendingPhone || !user.mfaCodeHash || !user.mfaCodeExpiresAt) {
    return NextResponse.json({ error: "No verification in progress. Please start over." }, { status: 400 });
  }
  if (user.mfaCodeExpiresAt < new Date()) {
    await clearPendingMfa(user.id);
    await logOtpEvent({ action: "OTP_EXPIRED", userId: auth.userId, churchId: auth.churchId, actorEmail: auth.email, ipAddress: ip, userAgent, metadata: { purpose: "ENROLL" } });
    return NextResponse.json({ error: "This code has expired. Please start over." }, { status: 400 });
  }
  if (user.mfaCodeAttempts >= MFA_MAX_CODE_ATTEMPTS) {
    await clearPendingMfa(user.id);
    return NextResponse.json({ error: "Too many incorrect attempts. Please start over." }, { status: 400 });
  }

  if (hashMfaCode(code) !== user.mfaCodeHash) {
    await prisma.user.update({ where: { id: user.id }, data: { mfaCodeAttempts: { increment: 1 } } });
    await logOtpEvent({ action: "OTP_FAILED", userId: auth.userId, churchId: auth.churchId, actorEmail: auth.email, ipAddress: ip, userAgent, metadata: { purpose: "ENROLL", stage: "VERIFY" } });
    return NextResponse.json({ error: "Incorrect code. Please try again." }, { status: 400 });
  }

  const wasAlreadyEnabled = user.mfaEnabled;

  await prisma.user.update({
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

  await logOtpEvent({ action: "OTP_VERIFIED", userId: auth.userId, churchId: auth.churchId, actorEmail: auth.email, ipAddress: ip, userAgent, metadata: { purpose: "ENROLL" } });
  await logOtpEvent({ action: wasAlreadyEnabled ? "PHONE_CHANGED" : "MFA_ENABLED", userId: auth.userId, churchId: auth.churchId, actorEmail: auth.email, ipAddress: ip, userAgent });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: wasAlreadyEnabled ? "settings.mfa_phone_changed" : "settings.mfa_enabled",
    entityType: "user",
    entityId: user.id,
    req,
  });

  return NextResponse.json({ success: true });
}

async function clearPendingMfa(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { pendingPhone: null, mfaCodeHash: null, mfaCodeExpiresAt: null, mfaCodeAttempts: 0 },
  });
}
