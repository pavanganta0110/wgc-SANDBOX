/**
 * SMS provider abstraction — a thin interface any transactional-SMS vendor
 * can implement, plus a Twilio implementation using Twilio's plain REST
 * API directly (no SDK dependency added, matching how finixClient talks to
 * Finix over raw fetch rather than an SDK). Modeled on email.ts's own
 * lazy-init / "log and return a failure result, never throw" pattern so a
 * missing provider configuration degrades gracefully instead of crashing
 * whatever feature tried to send a text.
 */

export interface SmsSendResult {
  success: boolean;
  providerMessageId?: string;
  error?: string;
}

export interface SmsProvider {
  send(to: string, body: string): Promise<SmsSendResult>;
}

class TwilioSmsProvider implements SmsProvider {
  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly fromNumber: string
  ) {}

  async send(to: string, body: string): Promise<SmsSendResult> {
    try {
      const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64");
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: to, From: this.fromNumber, Body: body }).toString(),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        return { success: false, error: data?.message || `Twilio returned HTTP ${res.status}` };
      }
      return { success: true, providerMessageId: data?.sid };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unknown SMS send error" };
    }
  }
}

/** Used whenever no SMS provider is configured — every send is a no-op
 * failure rather than a thrown exception, so a caller that unconditionally
 * tries to send an SMS reminder never takes down the rest of the request. */
class NoopSmsProvider implements SmsProvider {
  async send(): Promise<SmsSendResult> {
    return { success: false, error: "SMS is not configured for this environment." };
  }
}

let cachedProvider: SmsProvider | null = null;

export function getSmsProvider(): SmsProvider {
  if (cachedProvider) return cachedProvider;

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  cachedProvider = accountSid && authToken && fromNumber ? new TwilioSmsProvider(accountSid, authToken, fromNumber) : new NoopSmsProvider();
  return cachedProvider;
}
