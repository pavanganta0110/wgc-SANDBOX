import { prisma } from "@/lib/prisma";
import { setSessionCookie } from "@/lib/auth/session";
import type { User } from "@prisma/client";

/** Everything that happens once an admin login is actually allowed to
 * succeed — shared by the password-only path (mfaEnabled false, still
 * being rolled out) and the post-OTP path (src/app/api/admin/login/
 * mfa-verify/route.ts), so the two reach the exact same end state rather
 * than two drifting copies of session-setting logic. Mirrors
 * completeMerchantLogin.ts's role on the merchant side.
 *
 * mfaVerified is required (not defaulted) so every call site has to make
 * an explicit choice: true only from the post-OTP verify route, false from
 * the password-only pre-enrollment path. This value is what
 * requireMfaVerifiedAdminSession() checks to gate high-risk admin APIs —
 * getting it wrong here would silently weaken that gate for every route
 * that depends on it. */
export async function completeAdminLogin(user: User, ip: string, userAgent: string | null, mfaVerified: boolean) {
  await setSessionCookie({
    userId: user.id,
    email: user.email,
    role: user.role as "wgc_super_admin" | "wgc_admin",
    churchId: null,
    passwordChangedAt: user.passwordChangedAt ? user.passwordChangedAt.getTime() : null,
    mfaVerified,
  });

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
    prisma.auditLog.create({
      data: { action: "LOGIN_SUCCEEDED", actorEmail: user.email, ipAddress: ip, userAgent },
    }),
  ]);
}
