/**
 * ============================================================================
 * AUTHENTICATION-ONLY SMS SENDER.
 *
 * Our Twilio A2P 10DLC campaign is approved SPECIFICALLY for
 * authentication/2FA traffic — login verification codes and enrollment
 * codes. It is NOT approved for donor messaging, fundraising, Giving Link
 * texts, marketing, or church announcements. Sending any non-authentication
 * content through this number would violate that campaign's terms and put
 * the number at risk of being blocked or the campaign revoked.
 *
 * This module is the ONLY place in the codebase allowed to read
 * TWILIO_2FA_FROM_NUMBER or call Twilio's Messages API for authentication
 * purposes. Do not import this from anywhere that isn't sending a login or
 * MFA-enrollment verification code. Donor/campaign/invoice messaging must
 * use (or continue to be hard-disabled through) src/lib/sms/sendText.ts,
 * which deliberately checks for a *different*, currently-unset
 * TWILIO_DONOR_FROM_NUMBER — see that file's own comment.
 * ============================================================================
 */

import { recordTwilioTechnicalFailure, recordTwilioConfigMissing } from "@/lib/monitoring/twilioHealth";

export interface AuthSmsSendResult {
  success: boolean;
  providerMessageId?: string;
  error?: string;
}

export function isAuthSmsConfigured(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_2FA_FROM_NUMBER);
}

/** Sends an authentication SMS (login code, enrollment code, resend, admin
 * login code) via the 2FA-approved Twilio number. Never throws — returns a
 * failure result instead, matching this codebase's existing SMS-sender
 * convention, so a delivery failure never takes down the request that
 * triggered it. */
export async function sendAuthSms(to: string, body: string): Promise<AuthSmsSendResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_2FA_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    recordTwilioConfigMissing("auth_sms");
    return { success: false, error: "Two-factor authentication SMS is not configured for this environment." };
  }

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const statusCallbackUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://www.wgcpayments.com"}/api/webhooks/twilio/auth-status`;
  const params = new URLSearchParams({ To: to, From: fromNumber, Body: body, StatusCallback: statusCallbackUrl });

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const twilioErrorCode = data?.code != null ? String(data.code) : undefined;
      recordTwilioTechnicalFailure({
        httpStatus: res.status,
        twilioErrorCode,
        wasException: false,
        message: data?.message || `Twilio error (${res.status})`,
        context: "auth_sms",
      });
      return { success: false, error: data?.message || `Twilio error (${res.status})` };
    }

    return { success: true, providerMessageId: data?.sid };
  } catch (err) {
    recordTwilioTechnicalFailure({
      httpStatus: null,
      wasException: true,
      message: err instanceof Error ? err.message : "Failed to send verification code",
      context: "auth_sms",
    });
    return { success: false, error: err instanceof Error ? err.message : "Failed to send verification code" };
  }
}
