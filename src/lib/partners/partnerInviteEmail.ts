import { prisma } from "@/lib/prisma";
import { sendWgcEmail } from "@/lib/email";
import { PARTNER_INVITE_TTL_DAYS } from "./partnerAccounts";

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Emails an invitation to the partner dashboard and logs it. The link is a one-time
 * credential, so the log keeps a placeholder instead of the link. Returns whether it sent.
 */
export async function sendPartnerInviteEmail(params: { partnerName: string; email: string; rawToken: string }): Promise<boolean> {
  const link = `${process.env.NEXT_PUBLIC_APP_URL || "https://www.wgcpayments.com"}/partner/accept-invite/${params.rawToken}`;
  const subject = `You've been invited to the ${params.partnerName} partner dashboard on WGC Payments`;
  const result = await sendWgcEmail({
    to: params.email,
    subject,
    title: "You're invited",
    badgeText: "Partner Invitation",
    badgeColor: "#0B5DBC",
    bodyHtml: `<p>You've been invited to manage the <strong>${escapeHtml(params.partnerName)}</strong> partner account on WGC Payments.</p>
               <p><a href="${link}">Accept the invitation and set your password</a></p>
               <p>This link works once and expires in ${PARTNER_INVITE_TTL_DAYS} days.</p>`,
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
