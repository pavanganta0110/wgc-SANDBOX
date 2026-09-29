import { prisma } from "@/lib/prisma";
import { sendWgcEmail } from "@/lib/email";
import { getAlertEmailRecipient, getAlertSmsRecipient, isSmsAlertingConfigured } from "./alertRecipients";
import { buildInitialOrEscalationSubject, buildInitialOrEscalationBody, buildRecoverySubject, buildRecoveryBody, buildSmsBody, type IncidentAlertData } from "./alertContent";
import { ALERT_REMINDER_INTERVAL_CRITICAL_MS, ALERT_REMINDER_INTERVAL_ERROR_MS, ALERT_WARNING_EMAIL_ENABLED } from "./thresholds";

/**
 * The alert engine — decides which channels an incident change should go
 * out on and dispatches them, recording every attempt to SystemAlert.
 *
 * ANTI-RECURSION (the most important property of this module): nothing in
 * here ever calls recordHealthEvent() or touches the SystemErrorGroup/
 * SystemIncident pipeline for ITS OWN delivery failures. An alert email
 * failing is recorded ONLY as a plain SystemAlert row with
 * deliveryStatus="FAILED" — a dead end, never fed back into incident
 * detection. Without this, "Resend is down" -> "try to email that Resend
 * is down" -> "email fails" -> "record a Resend health event" -> "incident
 * engine re-evaluates Resend" could compound; this module structurally
 * cannot start that chain because it never calls recordHealthEvent at all.
 *
 * CHANNEL INDEPENDENCE: an alert about a "Resend" incident is never sent
 * BY email (obviously pointless — that channel is what's broken); an alert
 * about a "Twilio" incident is never sent by SMS. Every other channel
 * combination is attempted independently — a failure on one channel never
 * blocks another (each dispatch is wrapped in its own try/catch).
 *
 * sendWgcEmail() is reused as-is for the email channel (this project's
 * existing communication infrastructure) — it happens to still run its own
 * Phase 3 Resend-health instrumentation on failure, which is fine and
 * intentional: a genuine Resend outage should still register there through
 * the normal path; the reason a *new* alert doesn't cascade indefinitely is
 * that incidentEngine.ts's upsert only calls notifyIncidentChange on
 * genuinely new state (creation/escalation/recovery), never on a repeat
 * occurrence of the same severity — see its own doc comment.
 */

export type NotificationType = "INITIAL" | "ESCALATION" | "REMINDER" | "RECOVERY";

interface ChannelPlan {
  dashboard: boolean;
  email: boolean;
  sms: boolean;
}

function planChannels(severity: string, notificationType: NotificationType): ChannelPlan {
  if (notificationType === "RECOVERY") {
    // Only ever sent for an incident that actually generated a real alert
    // in the first place — checked by the caller before this is reached.
    return { dashboard: true, email: true, sms: severity === "CRITICAL" };
  }
  switch (severity) {
    case "CRITICAL":
      return { dashboard: true, email: true, sms: true };
    case "ERROR":
      return { dashboard: true, email: true, sms: false };
    case "WARNING":
      return { dashboard: true, email: ALERT_WARNING_EMAIL_ENABLED, sms: false };
    default:
      return { dashboard: true, email: false, sms: false };
  }
}

async function recordAlert(incidentId: string, severity: string, channel: "DASHBOARD" | "EMAIL" | "SMS", notificationType: NotificationType, recipient: string | null, deliveryStatus: "SENT" | "FAILED", providerMessageId?: string, failureReason?: string): Promise<void> {
  try {
    await prisma.systemAlert.create({
      data: { incidentId, severity, channel, notificationType, recipient, deliveryStatus, providerMessageId, failureReason },
    });
  } catch (err) {
    // A failure to even RECORD the alert attempt is logged and dropped —
    // it must never throw back into the incident engine.
    console.error("[alertEngine] failed to record SystemAlert row:", err);
  }
}

function toAlertData(incident: { title: string; service: string; severity: string; status: string; occurrenceCount: number; affectedMerchantCount: number; startedAt: Date; lastSeenAt: Date; resolvedAt: Date | null }): IncidentAlertData {
  return incident;
}

/**
 * Called by incidentEngine.ts right after it creates, escalates, or
 * resolves an incident. Never throws.
 */
export async function notifyIncidentChange(incidentId: string, notificationType: Exclude<NotificationType, "REMINDER">): Promise<void> {
  try {
    const incident = await prisma.systemIncident.findUnique({ where: { id: incidentId } });
    if (!incident) return;

    if (notificationType === "RECOVERY") {
      const everAlerted = await prisma.systemAlert.findFirst({ where: { incidentId, channel: { in: ["EMAIL", "SMS"] }, deliveryStatus: "SENT" } });
      if (!everAlerted) {
        // Never generated a real alert (e.g. it stayed WARNING with email
        // disabled) — a recovery notification for something nobody was
        // told about would be confusing, not useful.
        return;
      }
    }

    await dispatchAlert(incident, notificationType);
  } catch (err) {
    console.error("[notifyIncidentChange] failed:", err);
  }
}

/**
 * Called by the daily system-health-sweep cron — sends a reminder for any
 * still-open CRITICAL/ERROR incident that hasn't been re-notified within
 * its configured interval. WARNING/INFO incidents never get reminders
 * (dashboard/history only past the initial notification, per the default
 * policy).
 */
export async function sendDueReminders(): Promise<void> {
  const openIncidents = await prisma.systemIncident.findMany({
    where: { status: { in: ["OPEN", "INVESTIGATING", "MONITORING"] }, severity: { in: ["CRITICAL", "ERROR"] } },
  });

  for (const incident of openIncidents) {
    try {
      const lastAlert = await prisma.systemAlert.findFirst({ where: { incidentId: incident.id }, orderBy: { sentAt: "desc" } });
      if (!lastAlert) continue; // never alerted at all yet — that's notifyIncidentChange's job, not a reminder
      const interval = incident.severity === "CRITICAL" ? ALERT_REMINDER_INTERVAL_CRITICAL_MS : ALERT_REMINDER_INTERVAL_ERROR_MS;
      if (Date.now() - lastAlert.sentAt.getTime() < interval) continue;
      await dispatchAlert(incident, "REMINDER");
    } catch (err) {
      console.error(`[sendDueReminders] failed for incident ${incident.id}:`, err);
    }
  }
}

async function dispatchAlert(
  incident: { id: string; title: string; service: string; severity: string; status: string; occurrenceCount: number; affectedMerchantCount: number; startedAt: Date; lastSeenAt: Date; resolvedAt: Date | null },
  notificationType: NotificationType
): Promise<void> {
  const plan = planChannels(incident.severity, notificationType);
  const data = toAlertData(incident);

  // Dashboard "channel" is just a history record — the dashboard itself
  // always reflects the current incident state live; this row exists so
  // Alert History has a complete account of every notification moment.
  if (plan.dashboard) {
    await recordAlert(incident.id, incident.severity, "DASHBOARD", notificationType, "platform-admins", "SENT");
  }

  // Channel independence: never alert about a Resend incident BY email, or
  // a Twilio incident BY SMS — see module doc comment.
  const skipEmail = incident.service === "Resend";
  const skipSms = incident.service === "Twilio";

  if (plan.email && !skipEmail) {
    const recipient = getAlertEmailRecipient();
    if (!recipient) {
      await recordAlert(incident.id, incident.severity, "EMAIL", notificationType, null, "FAILED", undefined, "SUPPORT_EMAIL is not configured");
    } else {
      try {
        const subject = notificationType === "RECOVERY" ? buildRecoverySubject(data) : buildInitialOrEscalationSubject(data);
        const body = notificationType === "RECOVERY" ? buildRecoveryBody(data) : buildInitialOrEscalationBody(data);
        const result = await sendWgcEmail({
          to: recipient,
          subject,
          title: subject,
          badgeText: notificationType === "RECOVERY" ? "Recovered" : incident.severity,
          bodyHtml: body.split("\n").map((line) => (line ? `<p>${line}</p>` : "")).join(""),
        });
        if (result.success) {
          await recordAlert(incident.id, incident.severity, "EMAIL", notificationType, recipient, "SENT", result.data?.id);
        } else {
          await recordAlert(incident.id, incident.severity, "EMAIL", notificationType, recipient, "FAILED", undefined, String(result.error?.message ?? result.error ?? "send failed"));
        }
      } catch (err) {
        await recordAlert(incident.id, incident.severity, "EMAIL", notificationType, recipient, "FAILED", undefined, err instanceof Error ? err.message : "send failed");
      }
    }
  }

  if (plan.sms && !skipSms) {
    if (!isSmsAlertingConfigured()) {
      await recordAlert(incident.id, incident.severity, "SMS", notificationType, null, "FAILED", undefined, "SMS alerting is not configured yet (no compliant number/campaign) — see alertRecipients.ts");
    } else {
      const recipient = getAlertSmsRecipient();
      try {
        // Deliberately a raw fetch to Twilio's REST API using the
        // dedicated WGC_ALERT_SMS_FROM_NUMBER — never
        // TWILIO_2FA_FROM_NUMBER, which is approved for authentication
        // content only (see authSmsSender.ts).
        const accountSid = process.env.TWILIO_ACCOUNT_SID!;
        const authToken = process.env.TWILIO_AUTH_TOKEN!;
        const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
        const params = new URLSearchParams({ To: recipient!, From: process.env.WGC_ALERT_SMS_FROM_NUMBER!, Body: buildSmsBody(data, notificationType === "RECOVERY" ? "RECOVERY" : "ALERT") });
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
          method: "POST",
          headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
          body: params.toString(),
        });
        const resData = await res.json().catch(() => ({}));
        if (res.ok) {
          await recordAlert(incident.id, incident.severity, "SMS", notificationType, recipient, "SENT", resData?.sid);
        } else {
          await recordAlert(incident.id, incident.severity, "SMS", notificationType, recipient, "FAILED", undefined, resData?.message || `Twilio error (${res.status})`);
        }
      } catch (err) {
        await recordAlert(incident.id, incident.severity, "SMS", notificationType, recipient, "FAILED", undefined, err instanceof Error ? err.message : "send failed");
      }
    }
  }
}
