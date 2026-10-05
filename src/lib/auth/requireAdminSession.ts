import { getAdminSession, type AdminSession } from "@/lib/auth/session";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/errors";
import { isAdminMfaEnforced } from "@/lib/auth/adminMfaPolicy";

/**
 * The single centralized entry point for "is there a valid, current,
 * MFA-verified WGC admin session" — required by every high-risk admin API
 * (impersonation, refunds/charges/waives, admin/user role changes,
 * disabling accounts, merchant provisioning; see each route's own comment
 * for why it's gated). Every other admin API route may continue calling
 * getAdminSession() directly where MFA isn't warranted (read-only pages,
 * data-sync triggers, etc.) — this helper is deliberately opt-in per route,
 * not a blanket replacement for getAdminSession().
 *
 * Layered checks, in order:
 *  1. A valid admin session exists at all (getAdminSession() — this
 *     already re-verifies against the DB on every call: not disabled,
 *     password not changed since the token was issued).
 *  2. The role is wgc_admin or wgc_super_admin (redundant with
 *     getAdminSession()'s own role check, but asserted here too since this
 *     is the security boundary this function exists to guarantee).
 *  3. session.mfaEnabled — the ACCOUNT has completed MFA enrollment.
 *  4. session.mfaVerified — THIS SESSION was actually issued after OTP
 *     verification (signed into the token itself; see
 *     SessionPayload.mfaVerified's comment in session.ts for why this is
 *     never derived from the DB mfaEnabled flag). A password-only session
 *     issued before enrollment fails this check even if the account has
 *     since enabled MFA in a different browser/session — there is no path
 *     by which the browser can set or forge this claim.
 *
 * Throws UnauthorizedError (401, no session / invalid role) or
 * ForbiddenError (403, session valid but not MFA-verified) — never returns
 * null. Route handlers should catch with isAuthError() the same way
 * requireMerchantSession() callers already do.
 */
export async function requireMfaVerifiedAdminSession(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) {
    throw new UnauthorizedError("Admin authentication required.");
  }
  if (session.role !== "wgc_admin" && session.role !== "wgc_super_admin") {
    throw new UnauthorizedError("Admin authentication required.");
  }
  // Sandbox/staging with enforcement off (never live): no SMS provider, so
  // the 2FA checks below can't be satisfied — see adminMfaPolicy.ts.
  if (!isAdminMfaEnforced()) return session;
  if (!session.mfaEnabled) {
    throw new ForbiddenError("This action requires two-factor authentication to be enabled on your admin account.");
  }
  if (!session.mfaVerified) {
    throw new ForbiddenError("This action requires a two-factor-verified session. Please log in again and complete the verification code step.");
  }
  return session;
}
