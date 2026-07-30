import { prisma } from "@/lib/prisma";
import { sendWgcEmail } from "@/lib/email";

/**
 * Aplos sync email notifications. Follows the exact pattern established in
 * src/lib/support/ticketNotifications.ts: best-effort, every attempt
 * (success or failure) is written to EmailLog, and a failed send NEVER
 * throws back into the caller — by the time these run, the AplosSyncRecord
 * row is already committed, and losing that over an email-provider hiccup
 * would be strictly worse than a missed notification.
 *
 * Recipients are the organization's owner/admin users (the roles that hold
 * canManageIntegrations by default — see docs/integrations/aplos.md
 * section 3). This does not account for a per-user permissionsJson
 * override; it is a reasonable, explicit choice for an alert list, not an
 * attempt to compute exact effective permissions for every user.
 */

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "https://www.wgcpayments.com";
}

async function logEmailAttempt(params: { type: string; to: string; subject: string; success: boolean; error?: unknown }) {
  try {
    await prisma.emailLog.create({
      data: {
        type: params.type,
        to: params.to,
        subject: params.subject,
        status: params.success ? "SENT" : "FAILED",
        error: params.success ? null : safeStringify(params.error),
        sentAt: params.success ? new Date() : null,
      },
    });
  } catch (err) {
    console.error("Failed to write EmailLog row for Aplos sync email:", err);
  }
}

function safeStringify(value: unknown): string {
  if (value instanceof Error) return value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function orgManagers(churchId: string): Promise<{ name: string | null; email: string }[]> {
  const users = await prisma.user.findMany({
    where: { churchId, role: { in: ["owner", "admin"] }, disabledAt: null },
    select: { name: true, email: true },
  });
  return users;
}

async function sendToRecipients(recipients: { name: string | null; email: string }[], type: string, subject: string, bodyHtml: (name: string | null) => string) {
  for (const recipient of recipients) {
    let success = true;
    let error: unknown;
    try {
      const result = await sendWgcEmail({ to: recipient.email, subject, title: "Aplos Sync Notification", bodyHtml: bodyHtml(recipient.name) });
      success = result.success;
      error = result.success ? undefined : result.error;
    } catch (err) {
      success = false;
      error = err;
    }
    await logEmailAttempt({ type, to: recipient.email, subject, success, error });
  }
}

/**
 * Sent when a settlement's sync outcome could not be confirmed with Aplos
 * (NEEDS_REVIEW) — the single most operationally important notification in
 * this integration, since only the organization's own Aplos administrator
 * can verify the outcome directly in their Aplos account. Also sent to
 * SUPPORT_EMAIL (if configured) for WGC awareness, matching the platform-
 * wide triage view built in Checkpoint 8.
 */
export async function notifySyncNeedsReview(churchId: string, finixSettlementId: string, safeMessage: string) {
  try {
    const [church, recipients] = await Promise.all([prisma.church.findUnique({ where: { id: churchId }, select: { name: true } }), orgManagers(churchId)]);
    const orgName = church?.name || "Your organization";
    const link = `${appUrl()}/merchant/settings/integrations/aplos`;
    const subject = `Action needed: Aplos sync requires manual review — ${orgName}`;

    await sendToRecipients(recipients, "APLOS_SYNC_NEEDS_REVIEW", subject, (name) => `
      <p>${escapeHtml(name ? `Hi ${name},` : "Hi,")}</p>
      <p>A settlement synchronization to Aplos for <strong>${escapeHtml(orgName)}</strong> could not be automatically confirmed and will not be retried automatically.</p>
      <p><strong>Settlement:</strong> ${escapeHtml(finixSettlementId)}</p>
      <p>${escapeHtml(safeMessage)}</p>
      <p>Please check your Aplos account directly to confirm whether this contribution was created, then contact WGC support so this can be resolved.</p>
      <p><a href="${link}">View your Aplos integration</a></p>
    `);

    const supportEmail = process.env.SUPPORT_EMAIL;
    if (supportEmail) {
      await sendToRecipients([{ name: null, email: supportEmail }], "APLOS_SYNC_NEEDS_REVIEW_SUPPORT", `[Aplos] NEEDS_REVIEW — ${orgName} — ${finixSettlementId}`, () => `
        <p><strong>Organization:</strong> ${escapeHtml(orgName)} (${escapeHtml(churchId)})</p>
        <p><strong>Settlement:</strong> ${escapeHtml(finixSettlementId)}</p>
        <p>${escapeHtml(safeMessage)}</p>
        <p><a href="${appUrl()}/admin/merchants/${churchId}/aplos">View in admin dashboard</a></p>
      `);
    }
  } catch (err) {
    console.error(`Failed to send Aplos NEEDS_REVIEW notification for church ${churchId}, settlement ${finixSettlementId}:`, err);
  }
}

/** Sent when a settlement sync becomes terminally FAILED — exhausted
 * automatic retries, or a non-retryable classified error. Distinct from
 * NEEDS_REVIEW: the organization can safely press Retry once the
 * underlying issue (e.g. an expired Aplos credential) is fixed. */
export async function notifySyncFailed(churchId: string, finixSettlementId: string, safeMessage: string) {
  try {
    const [church, recipients] = await Promise.all([prisma.church.findUnique({ where: { id: churchId }, select: { name: true } }), orgManagers(churchId)]);
    const orgName = church?.name || "Your organization";
    const link = `${appUrl()}/merchant/settings/integrations/aplos`;
    const subject = `Aplos sync failed — ${orgName}`;

    await sendToRecipients(recipients, "APLOS_SYNC_FAILED", subject, (name) => `
      <p>${escapeHtml(name ? `Hi ${name},` : "Hi,")}</p>
      <p>A settlement synchronization to Aplos for <strong>${escapeHtml(orgName)}</strong> failed.</p>
      <p><strong>Settlement:</strong> ${escapeHtml(finixSettlementId)}</p>
      <p>${escapeHtml(safeMessage)}</p>
      <p>You can retry this settlement from your Aplos integration settings once the underlying issue is resolved.</p>
      <p><a href="${link}">View your Aplos integration</a></p>
    `);
  } catch (err) {
    console.error(`Failed to send Aplos FAILED notification for church ${churchId}, settlement ${finixSettlementId}:`, err);
  }
}
