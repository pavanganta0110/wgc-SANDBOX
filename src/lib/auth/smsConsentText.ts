/** Client-safe (no server-only imports) — the single source of truth for the
 * SMS 2FA consent disclosure, shared by the enrollment UI, the server-side
 * consent-logging helper, and the public /legal/sms-consent verification
 * page, so the three can never drift out of sync. */
export const SMS_2FA_CONSENT_TEXT_VERSION = "sms-2fa-v1";

export const SMS_2FA_CONSENT_TEXT =
  "I agree to receive SMS verification codes from WGC Payments at the mobile number provided for account authentication and security. Message frequency varies based on login and security activity. Message and data rates may apply. Reply STOP to opt out or HELP for help. SMS consent is optional and is not a condition of creating or using a WGC Payments account.";
