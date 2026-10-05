/**
 * Donor / Giving Link / campaign text-message sender.
 *
 * ============================================================================
 * HARD-DISABLED BY DESIGN — deliberately checks for TWILIO_DONOR_FROM_NUMBER,
 * an environment variable that is NOT currently set anywhere and must not be
 * set until a separate, Twilio-approved non-authentication campaign/number
 * exists.
 *
 * Our only approved Twilio A2P 10DLC campaign right now is for
 * authentication/2FA traffic (see src/lib/sms/authSmsSender.ts). Donor
 * messaging, fundraising texts, and Giving Link SMS are not launched. Do
 * NOT change this file to fall back to TWILIO_FROM_NUMBER, TWILIO_2FA_*, or
 * any other authentication-sender variable, even temporarily — doing so
 * would let donor/campaign traffic ride the 2FA-approved number the moment
 * the auth env vars are set, which is exactly the campaign-content
 * mismatch that got a prior submission rejected. This is meant to be a
 * technical guarantee, not a product/paid-plan gate: isSmsConfigured()
 * here must stay false until TWILIO_DONOR_FROM_NUMBER is deliberately
 * introduced alongside its own approved campaign.
 * ============================================================================
 */

export function isSmsConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_DONOR_FROM_NUMBER
  );
}

export async function sendText(to: string, body: string): Promise<{ success: boolean; error?: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_DONOR_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    return { success: false, error: "Text messaging is not available yet." };
  }

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const params = new URLSearchParams({ To: to, From: fromNumber, Body: body });

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { success: false, error: data?.message || `Twilio error (${res.status})` };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to send text message" };
  }
}
