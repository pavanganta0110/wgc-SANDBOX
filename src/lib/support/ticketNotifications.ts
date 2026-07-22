import { prisma } from "@/lib/prisma";
import { sendWgcEmail } from "@/lib/email";
import type { SupportTicket } from "@prisma/client";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "https://wgcpayments.com";
}

/**
 * Best-effort — every notify* function here catches its own errors and
 * always records the attempt (success or failure) to EmailLog, the same
 * table the existing admin Email Logs page already reads. A failed send
 * must never throw back into the caller: the ticket/message row is
 * already committed by the time these run, and losing or duplicating
 * that data over an email provider hiccup would be strictly worse than a
 * missed notification.
 */
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
    console.error("Failed to write EmailLog row for support ticket email:", err);
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

async function loadTicketContext(ticket: Pick<SupportTicket, "churchId" | "createdByUserId" | "createdByEmail">) {
  const [church, creator] = await Promise.all([
    prisma.church.findUnique({ where: { id: ticket.churchId }, select: { name: true } }),
    ticket.createdByUserId
      ? prisma.user.findUnique({ where: { id: ticket.createdByUserId }, select: { name: true, email: true, role: true } })
      : Promise.resolve(null),
  ]);
  return {
    orgName: church?.name || "Unknown Organization",
    orgId: ticket.churchId,
    creatorName: creator?.name || creator?.email || ticket.createdByEmail || "Unknown",
    creatorEmail: creator?.email || ticket.createdByEmail || "",
    creatorRole: creator?.role || "unknown",
  };
}

/** Sent to SUPPORT_EMAIL when a merchant creates a new ticket. */
export async function notifyNewSupportTicket(ticket: SupportTicket) {
  const supportEmail = process.env.SUPPORT_EMAIL;
  if (!supportEmail) {
    console.error(`SUPPORT_EMAIL not configured — could not notify WGC of new ticket ${ticket.ticketNumber}`);
    return;
  }
  const { orgName, creatorName, creatorEmail, creatorRole } = await loadTicketContext(ticket);
  const adminLink = `${appUrl()}/admin/support/tickets/${ticket.id}`;
  const subject = `New WGC Support Ticket — ${ticket.ticketNumber} — ${orgName}`;
  const bodyHtml = `
    <p><strong>Ticket:</strong> ${escapeHtml(ticket.ticketNumber)}</p>
    <p><strong>Organization:</strong> ${escapeHtml(orgName)}</p>
    <p><strong>Created by:</strong> ${escapeHtml(creatorName)} (${escapeHtml(creatorEmail)}) — ${escapeHtml(creatorRole)}</p>
    <p><strong>Category:</strong> ${escapeHtml(ticket.category)}</p>
    <p><strong>Priority:</strong> ${escapeHtml(ticket.priority)}</p>
    <p><strong>Subject:</strong> ${escapeHtml(ticket.subject)}</p>
    <p><strong>Message:</strong><br/>${escapeHtml(ticket.description)}</p>
    <p><strong>Created:</strong> ${ticket.createdAt.toISOString()}</p>
    <p><a href="${adminLink}">View this ticket in the admin dashboard</a></p>
  `;
  let success = true;
  let error: unknown;
  try {
    const result = await sendWgcEmail({ to: supportEmail, subject, title: "New Support Ticket", badgeText: ticket.priority, bodyHtml });
    success = result.success;
    error = result.success ? undefined : result.error;
  } catch (err) {
    success = false;
    error = err;
  }
  await logEmailAttempt({ type: "SUPPORT_TICKET_CREATED", to: supportEmail, subject, success, error });
}

/** Sent to SUPPORT_EMAIL when a merchant replies to an existing ticket. */
export async function notifyMerchantReply(ticket: SupportTicket, replyBody: string) {
  const supportEmail = process.env.SUPPORT_EMAIL;
  if (!supportEmail) return;
  const { orgName, creatorName, creatorEmail } = await loadTicketContext(ticket);
  const adminLink = `${appUrl()}/admin/support/tickets/${ticket.id}`;
  const subject = `Merchant replied to ticket ${ticket.ticketNumber} — ${orgName}`;
  const bodyHtml = `
    <p><strong>Ticket:</strong> ${escapeHtml(ticket.ticketNumber)}</p>
    <p><strong>Organization:</strong> ${escapeHtml(orgName)}</p>
    <p><strong>From:</strong> ${escapeHtml(creatorName)} (${escapeHtml(creatorEmail)})</p>
    <p><strong>Reply:</strong><br/>${escapeHtml(replyBody)}</p>
    <p><strong>Status:</strong> ${escapeHtml(ticket.status)}</p>
    <p><a href="${adminLink}">View this ticket in the admin dashboard</a></p>
  `;
  let success = true;
  let error: unknown;
  try {
    const result = await sendWgcEmail({ to: supportEmail, subject, title: "Merchant Replied", bodyHtml });
    success = result.success;
    error = result.success ? undefined : result.error;
  } catch (err) {
    success = false;
    error = err;
  }
  await logEmailAttempt({ type: "SUPPORT_TICKET_MERCHANT_REPLY", to: supportEmail, subject, success, error });
}

/** Sent to the ticket's creator when WGC posts a merchant-visible reply. Never called for internal notes. */
export async function notifyWgcReply(ticket: SupportTicket, replyBody: string) {
  const { orgName, creatorEmail } = await loadTicketContext(ticket);
  if (!creatorEmail) return;
  const merchantLink = `${appUrl()}/merchant/support/tickets/${ticket.id}`;
  const subject = `WGC Support replied to ticket ${ticket.ticketNumber}`;
  const bodyHtml = `
    <p><strong>Organization:</strong> ${escapeHtml(orgName)}</p>
    <p><strong>Ticket:</strong> ${escapeHtml(ticket.ticketNumber)}</p>
    <p><strong>Subject:</strong> ${escapeHtml(ticket.subject)}</p>
    <p><strong>WGC Reply:</strong><br/>${escapeHtml(replyBody)}</p>
    <p><strong>Status:</strong> ${escapeHtml(ticket.status)}</p>
    <p>Please reply through your WGC Payments dashboard so the complete conversation remains attached to this ticket.</p>
    <p><a href="${merchantLink}">View this ticket</a></p>
  `;
  let success = true;
  let error: unknown;
  try {
    const result = await sendWgcEmail({ to: creatorEmail, subject, title: "WGC Support Replied", bodyHtml });
    success = result.success;
    error = result.success ? undefined : result.error;
  } catch (err) {
    success = false;
    error = err;
  }
  await logEmailAttempt({ type: "SUPPORT_TICKET_WGC_REPLY", to: creatorEmail, subject, success, error });
}

export async function notifyTicketStatusChange(ticket: SupportTicket, isReopen = false) {
  const { orgName, creatorEmail } = await loadTicketContext(ticket);
  if (!creatorEmail) return;

  const merchantLink = `${appUrl()}/merchant/support/tickets/${ticket.id}`;
  let statusText = ticket.status;
  if (statusText === "WAITING_ON_ORGANIZATION") {
    statusText = "WAITING_ON_MERCHANT";
  }

  const actionText = isReopen ? "reopened" : statusText === "CLOSED" ? "closed" : `status updated to ${statusText}`;
  const subject = `WGC Support ${isReopen ? "reopened" : statusText === "CLOSED" ? "closed" : "status update"} ticket ${ticket.ticketNumber}`;
  
  const bodyHtml = `
    <p><strong>Organization:</strong> ${escapeHtml(orgName)}</p>
    <p><strong>Ticket:</strong> ${escapeHtml(ticket.ticketNumber)}</p>
    <p><strong>Subject:</strong> ${escapeHtml(ticket.subject)}</p>
    <p><strong>Status Action:</strong> ${isReopen ? "Reopened" : escapeHtml(statusText)}</p>
    <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
    <p>Please review the update in your WGC Payments dashboard. You may reply to the ticket if you still need assistance.</p>
    <p><a href="${merchantLink}">View this ticket</a></p>
  `;

  let success = true;
  let error: unknown;
  try {
    const result = await sendWgcEmail({ to: creatorEmail, subject, title: `WGC Support Ticket ${isReopen ? "Reopened" : escapeHtml(statusText)}`, bodyHtml });
    success = result.success;
    error = result.success ? undefined : result.error;
  } catch (err) {
    success = false;
    error = err;
  }

  await logEmailAttempt({ type: isReopen ? "SUPPORT_TICKET_REOPENED" : `SUPPORT_TICKET_STATUS_${ticket.status}`, to: creatorEmail, subject, success, error });
}

export async function notifyTicketResolved(ticket: SupportTicket, resolutionSummary: string) {
  const { orgName, creatorEmail } = await loadTicketContext(ticket);
  if (!creatorEmail) return;

  const merchantLink = `${appUrl()}/merchant/support/tickets/${ticket.id}`;
  const subject = `WGC Support resolved ticket ${ticket.ticketNumber}`;
  
  const bodyHtml = `
    <p><strong>Organization:</strong> ${escapeHtml(orgName)}</p>
    <p><strong>Ticket:</strong> ${escapeHtml(ticket.ticketNumber)}</p>
    <p><strong>Subject:</strong> ${escapeHtml(ticket.subject)}</p>
    <p><strong>Resolution Summary:</strong><br/>${escapeHtml(resolutionSummary)}</p>
    <p><strong>Status:</strong> RESOLVED</p>
    <p><strong>Resolved Date:</strong> ${new Date().toLocaleString()}</p>
    <p>Please review the update in your WGC Payments dashboard. You may reply to the ticket if you still need assistance.</p>
    <p><a href="${merchantLink}">View this ticket</a></p>
  `;

  let success = true;
  let error: unknown;
  try {
    const result = await sendWgcEmail({ to: creatorEmail, subject, title: "WGC Support Ticket Resolved", bodyHtml });
    success = result.success;
    error = result.success ? undefined : result.error;
  } catch (err) {
    success = false;
    error = err;
  }

  await logEmailAttempt({ type: "SUPPORT_TICKET_RESOLVED", to: creatorEmail, subject, success, error });
}

export async function notifyAdminSupportChange(params: {
  churchName: string;
  affectedUserName: string;
  affectedUserEmail: string;
  changeDescription: string;
  reason: string;
  ticketNumber?: string | null;
}) {
  const { churchName, affectedUserName, affectedUserEmail, changeDescription, reason, ticketNumber } = params;
  const dashboardLink = `${appUrl()}/merchant/dashboard`;
  const subject = `Security Notification: Support update to your WGC Payments account`;
  
  const bodyHtml = `
    <p>Dear ${escapeHtml(affectedUserName || "User")},</p>
    <p>We are writing to notify you that WGC Payments Support has completed an update to your account.</p>
    <table style="width: 100%; text-align: left; border-collapse: collapse; margin-top: 20px; font-size: 14px;">
      <tr><td style="padding: 8px 0; border-bottom: 1px solid #E2E8F0;"><strong>Organization:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #E2E8F0;">${escapeHtml(churchName)}</td></tr>
      <tr><td style="padding: 8px 0; border-bottom: 1px solid #E2E8F0;"><strong>User Account:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #E2E8F0;">${escapeHtml(affectedUserEmail)}</td></tr>
      <tr><td style="padding: 8px 0; border-bottom: 1px solid #E2E8F0;"><strong>Change Completed:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #E2E8F0;">${escapeHtml(changeDescription)}</td></tr>
      <tr><td style="padding: 8px 0; border-bottom: 1px solid #E2E8F0;"><strong>Reason:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #E2E8F0;">${escapeHtml(reason)}</td></tr>
      ${ticketNumber ? `<tr><td style="padding: 8px 0; border-bottom: 1px solid #E2E8F0;"><strong>Related Ticket:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #E2E8F0;">${escapeHtml(ticketNumber)}</td></tr>` : ''}
      <tr><td style="padding: 8px 0; border-bottom: 1px solid #E2E8F0;"><strong>Date and Time:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #E2E8F0;">${new Date().toLocaleString()}</td></tr>
    </table>
    <p>Please review the update in your WGC Payments dashboard.</p>
    <p><a href="${dashboardLink}">Go to Dashboard</a></p>
  `;

  let success = true;
  let error: unknown;
  try {
    const result = await sendWgcEmail({ to: affectedUserEmail, subject, title: "WGC Support Change Notification", bodyHtml });
    success = result.success;
    error = result.success ? undefined : result.error;
  } catch (err) {
    success = false;
    error = err;
  }

  await logEmailAttempt({ type: "ADMIN_SUPPORT_CHANGE_NOTIFICATION", to: affectedUserEmail, subject, success, error });
}
