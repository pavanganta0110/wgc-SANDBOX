/**
 * Whether admin two-factor (SMS) is enforced on this deployment.
 *
 * SANDBOX REPOSITORY ONLY. The sandbox has no Twilio 2FA number, so admin
 * two-factor is OFF here unless ADMIN_MFA_ENFORCEMENT is exactly "on". The
 * live repository keeps the opposite default (always enforced on live) —
 * do not copy this file over to it.
 */
export function isAdminMfaEnforced(): boolean {
  return process.env.ADMIN_MFA_ENFORCEMENT === "on";
}
