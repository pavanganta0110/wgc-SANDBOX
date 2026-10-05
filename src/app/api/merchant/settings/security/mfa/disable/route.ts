import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { recordSmsConsentWithdrawn } from "@/lib/auth/smsConsent";
import { logOtpEvent } from "@/lib/auth/otpAuditLog";

export async function POST(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  // See enroll/route.ts's comment — never let an impersonated session
  // disable the impersonating ADMIN's own MFA.
  if (auth.impersonation) {
    return NextResponse.json({ error: "Personal account security settings aren't available while viewing as a merchant." }, { status: 403 });
  }

  // Reauthentication gate — turning MFA off is at least as sensitive as
  // turning it on, and is the kind of thing an attacker who's already
  // inside a session would want to do to make their own access durable.
  const now = Math.floor(Date.now() / 1000);
  if (!auth.authTime || now - auth.authTime > 600) {
    return NextResponse.json({ error: "Reauthentication required. Please log in again to verify your identity.", reauthRequired: true }, { status: 403 });
  }

  const userBefore = await prisma.user.findUnique({ where: { id: auth.userId }, select: { phone: true } });
  await prisma.user.update({ where: { id: auth.userId }, data: { mfaEnabled: false } });

  if (userBefore?.phone) {
    try {
      await recordSmsConsentWithdrawn({ userId: auth.userId, churchId: auth.churchId ?? null, phone: userBefore.phone, source: "settings_security_mfa_disable" });
    } catch (err) {
      console.error(`Failed to record SMS consent withdrawal for user ${auth.userId}:`, err);
    }
  }

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "settings.mfa_disabled",
    entityType: "user",
    entityId: auth.userId,
    req,
  });
  await logOtpEvent({ action: "MFA_DISABLED", userId: auth.userId, churchId: auth.churchId, actorEmail: auth.email });

  return NextResponse.json({ success: true });
}
