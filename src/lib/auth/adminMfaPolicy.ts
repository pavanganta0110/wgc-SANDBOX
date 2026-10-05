/**
 * Whether admin two-factor (SMS) is enforced on this deployment.
 *
 * Always TRUE by default, and always true on a live deployment — the
 * off-switch exists only so a sandbox/staging deployment that has no Twilio
 * 2FA number can still be used by its admins instead of locking everyone
 * at /admin/mfa-setup. It is honored only when BOTH:
 *   - ADMIN_MFA_ENFORCEMENT is exactly "off", and
 *   - NEXT_PUBLIC_FINIX_ENV is not "live".
 * Setting the variable on the live project therefore has no effect.
 */
export function isAdminMfaEnforced(): boolean {
  if (process.env.NEXT_PUBLIC_FINIX_ENV === "live") return true;
  return process.env.ADMIN_MFA_ENFORCEMENT !== "off";
}
