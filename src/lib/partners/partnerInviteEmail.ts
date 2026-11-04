import { prisma } from "@/lib/prisma";
import { sendWgcEmail } from "@/lib/email";
import { PARTNER_INVITE_TTL_DAYS } from "./partnerAccounts";

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type PartnerInviteRole = "FULL" | "VIEWER" | "AGENT";

/** What the invitation says depends on what the person will be able to do, so a view-only member or an agent isn't told they will "manage" the account. */
export function partnerInviteCopy(partnerName: string, role: PartnerInviteRole, link: string, ttlDays: number = PARTNER_INVITE_TTL_DAYS) {
  const name = escapeHtml(partnerName);
  const what =
    role === "AGENT"
      ? `see the clients you brought to <strong>${name}</strong>, their volume and transactions, and your commission`
      : role === "VIEWER"
        ? `view the <strong>${name}</strong> partner account. Your access is view-only: you can see reporting but not change settings`
        : `manage the <strong>${name}</strong> partner account`;
  return {
    subject: `You've been invited to the ${partnerName} partner dashboard on WGC Payments`,
    bodyHtml: `<p>You've been invited to ${what} on WGC Payments.</p>
               <p><a href="${link}">Accept the invitation and set your password</a></p>
               <p>This link works once and expires in ${ttlDays} days.</p>`,
  };
}

/**
 * Emails an invitation to the partner dashboard and logs it. The link is a one-time
 * credential, so the log keeps a placeholder instead of the link. Returns whether it sent.
 */
export async function sendPartnerInviteEmail(params: { partnerName: string; email: string; rawToken: string; role?: PartnerInviteRole }): Promise<boolean> {
  const link = `${process.env.NEXT_PUBLIC_APP_URL || "https://www.wgcpayments.com"}/partner/accept-invite/${params.rawToken}`;
  const { subject, bodyHtml } = partnerInviteCopy(params.partnerName, params.role ?? "FULL", link);
  const result = await sendWgcEmail({
    to: params.email,
    subject,
    title: "You're invited",
    badgeText: "Partner Invitation",
    badgeColor: "#0B5DBC",
    bodyHtml,
  });
  await prisma.emailLog.create({
    data: {
      type: "PARTNER_INVITE",
      to: params.email,
      subject,
      status: result.success ? "SENT" : "ERROR",
      sentAt: result.success ? new Date() : null,
      error: result.success ? null : String(result.error ?? "unknown error"),
      bodyHtml: "<p>Partner invitation (link not stored).</p>",
    },
  });
  return result.success;
}
