import { Resend } from "resend";
import { oneLine } from "./config";

export interface OutgoingMail {
  to: string;
  subject: string;
  html: string;
  /** Marketing follow-ups carry a one-click unsubscribe header. */
  unsubscribeUrl?: string | null;
}

let client: Resend | null = null;

/**
 * Sends one scorecard email through WGC's email service (Resend). Throws when email is not configured or the service
 * refuses, so the caller never records an email as sent that was not.
 * Settings: RESEND_API_KEY (already set for WGC), SCORECARD_MAIL_FROM (default EMAIL_FROM), SCORECARD_REPLY_TO,
 * SCORECARD_MAIL_BCC (optional copy of every email).
 */
export async function sendScorecardMail(mail: OutgoingMail): Promise<void> {
  if (!process.env.RESEND_API_KEY) throw new Error("Email is not configured (RESEND_API_KEY)");
  client ??= new Resend(process.env.RESEND_API_KEY);
  const from = process.env.SCORECARD_MAIL_FROM || process.env.EMAIL_FROM || "WGC Fundraising <no-reply@wgcpayments.com>";
  const replyTo = process.env.SCORECARD_REPLY_TO || process.env.SUPPORT_EMAIL || undefined;
  const bcc = process.env.SCORECARD_MAIL_BCC || undefined;

  const { error } = await client.emails.send({
    from,
    to: mail.to,
    subject: oneLine(mail.subject, 200),
    html: mail.html,
    ...(replyTo ? { replyTo } : {}),
    ...(bcc ? { bcc } : {}),
    ...(mail.unsubscribeUrl ? { headers: { "List-Unsubscribe": `<${mail.unsubscribeUrl}>` } } : {}),
  });
  if (error) throw new Error(`Email service refused: ${error.message ?? "unknown error"}`);
}
