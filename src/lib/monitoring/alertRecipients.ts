/**
 * Centralized platform-admin alert-recipient configuration — the ONLY place
 * alertEngine.ts reads a destination from, so a recipient is never
 * hard-coded into incident/alert business logic.
 *
 * Email reuses this app's existing, already-configured "notify WGC" contact
 * (SUPPORT_EMAIL — the same address sendWgcAdminEmail and every other
 * internal-alert precedent in src/lib/email.ts already targets), per the
 * "if the project already has platform-admin contact configuration, reuse
 * it" instruction.
 *
 * SMS has no existing precedent to reuse: Twilio in this codebase is
 * deliberately split by A2P 10DLC campaign approval, and the only approved
 * number (TWILIO_2FA_FROM_NUMBER) is authentication-only — sending an
 * operational alert through it would violate that documented compliance
 * boundary (see src/lib/sms/authSmsSender.ts's own header comment). Per the
 * decision already made earlier in this project (Phase 1 planning: "Email +
 * dashboard alerts only for now"), SMS alerting is wired end-to-end here —
 * channel routing, dedup, alert history — but genuinely sends nothing until
 * a real, compliant number/campaign exists. WGC_ALERT_SMS_FROM_NUMBER and
 * WGC_ALERT_SMS_TO are new, deliberately unset env vars for that future
 * number; isSmsAlertingConfigured() is what the rest of the alert engine
 * checks before attempting a send, exactly mirroring how Sentry's DSN being
 * unset is a documented no-op rather than a crash.
 */

export function getAlertEmailRecipient(): string | null {
  return process.env.SUPPORT_EMAIL || null;
}

export function isSmsAlertingConfigured(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.WGC_ALERT_SMS_FROM_NUMBER && process.env.WGC_ALERT_SMS_TO);
}

export function getAlertSmsRecipient(): string | null {
  return process.env.WGC_ALERT_SMS_TO || null;
}
