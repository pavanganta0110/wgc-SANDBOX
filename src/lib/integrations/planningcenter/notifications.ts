import { prisma } from "@/lib/prisma";
import { sendWgcEmail } from "@/lib/email";

/**
 * Planning Center emails to an organization's owners/admins. Same rules as
 * the Aplos notifications: best-effort, every attempt is written to
 * EmailLog, and a failed send NEVER throws back into the caller — by the time
 * these run the state change is already committed, and losing that over an
 * email hiccup would be strictly worse than a missed notification.
 */

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "https://www.wgcpayments.com";
}

const SETTINGS_PATH = "/merchant/settings/integrations/planning-center";

function safeStringify(value: unknown): string {
  if (value instanceof Error) return value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function logEmailAttempt(params: { type: string; to: string; subject: string; success: boolean; error?: unknown; bodyHtml: string }) {
  try {
    await prisma.emailLog.create({
      data: {
        type: params.type,
        to: params.to,
        subject: params.subject,
        status: params.success ? "SENT" : "FAILED",
        error: params.success ? null : safeStringify(params.error),
        sentAt: params.success ? new Date() : null,
        bodyHtml: params.bodyHtml,
      },
    });
  } catch (err) {
    console.error("Failed to write EmailLog row for Planning Center email:", err);
  }
}

async function orgManagers(churchId: string): Promise<{ name: string | null; email: string }[]> {
  return prisma.user.findMany({
    where: { churchId, role: { in: ["owner", "admin"] }, disabledAt: null },
    select: { name: true, email: true },
  });
}

async function sendToManagers(churchId: string, type: string, subject: string, bodyFor: (greeting: string, orgName: string) => string) {
  const [church, recipients] = await Promise.all([prisma.church.findUnique({ where: { id: churchId }, select: { name: true } }), orgManagers(churchId)]);
  const orgName = church?.name || "Your organization";
  for (const recipient of recipients) {
    const bodyHtml = bodyFor(escapeHtml(recipient.name ? `Hi ${recipient.name},` : "Hi,"), escapeHtml(orgName));
    let success = true;
    let error: unknown;
    try {
      const result = await sendWgcEmail({ to: recipient.email, subject: subject.replace("{org}", orgName), title: "Planning Center", bodyHtml });
      success = result.success;
      error = result.success ? undefined : result.error;
    } catch (err) {
      success = false;
      error = err;
    }
    await logEmailAttempt({ type, to: recipient.email, subject: subject.replace("{org}", orgName), success, error, bodyHtml });
  }
}

/** The church must reconnect: Planning Center no longer accepts our access. */
export async function notifyReconnectRequired(churchId: string) {
  try {
    await sendToManagers(churchId, "PLANNING_CENTER_RECONNECT", "Action needed: reconnect Planning Center — {org}", (greeting, org) => `
      <p>${greeting}</p>
      <p>WGC Payments can no longer reach the Planning Center account connected for <strong>${org}</strong>. Planning Center sync is paused until you reconnect.</p>
      <p><a href="${appUrl()}${SETTINGS_PATH}">Reconnect Planning Center</a></p>
    `);
  } catch (err) {
    console.error(`Failed to send Planning Center reconnect notification for church ${churchId}:`, err);
  }
}

/** An outcome we could not confirm: a person must look in Planning Center. Never auto-retried. */
export async function notifySyncNeedsReview(churchId: string, finixSettlementId: string, safeMessage: string) {
  try {
    await sendToManagers(churchId, "PLANNING_CENTER_SYNC_NEEDS_REVIEW", "Action needed: Planning Center sync needs a review — {org}", (greeting, org) => `
      <p>${greeting}</p>
      <p>WGC Payments could not confirm what happened with some gifts it was recording in Planning Center for <strong>${org}</strong>, so it has stopped and will not retry them automatically.</p>
      <p><strong>Deposit:</strong> ${escapeHtml(finixSettlementId)}</p>
      <p>${escapeHtml(safeMessage)}</p>
      <p>Please check the batch in Planning Center Giving to see whether those gifts are there, then tell WGC what you found.</p>
      <p><a href="${appUrl()}${SETTINGS_PATH}">Review in WGC</a></p>
    `);
  } catch (err) {
    console.error(`Failed to send Planning Center needs-review notification for church ${churchId}:`, err);
  }
}

/** Gave up after repeated failures; the church can retry once the cause is fixed. */
export async function notifySyncFailed(churchId: string, finixSettlementId: string, safeMessage: string) {
  try {
    await sendToManagers(churchId, "PLANNING_CENTER_SYNC_FAILED", "Planning Center sync failed — {org}", (greeting, org) => `
      <p>${greeting}</p>
      <p>WGC Payments could not record a deposit's gifts in Planning Center for <strong>${org}</strong>.</p>
      <p><strong>Deposit:</strong> ${escapeHtml(finixSettlementId)}</p>
      <p>${escapeHtml(safeMessage)}</p>
      <p>You can retry from your Planning Center settings once the issue is fixed.</p>
      <p><a href="${appUrl()}${SETTINGS_PATH}">Open Planning Center settings</a></p>
    `);
  } catch (err) {
    console.error(`Failed to send Planning Center failure notification for church ${churchId}:`, err);
  }
}
