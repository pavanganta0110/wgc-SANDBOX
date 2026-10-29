import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { sendWgcEmail } from "@/lib/email";
import { isValidEmail } from "@/lib/donors/donorContact";
import { requirePartnerAdmin } from "@/lib/partners/requirePartnerAdmin";
import { createPartnerInvite, PartnerAccountError, PARTNER_INVITE_TTL_DAYS } from "@/lib/partners/partnerAccounts";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function POST(req: Request, { params }: { params: Promise<{ partnerId: string }> }) {
  const auth = await requirePartnerAdmin();
  if ("response" in auth) return auth.response;
  const { partnerId } = await params;

  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const partner = await prisma.partner.findUnique({ where: { id: partnerId }, select: { id: true, name: true, status: true } });
  if (!partner) return NextResponse.json({ error: "Partner not found." }, { status: 404 });
  if (partner.status !== "ACTIVE") return NextResponse.json({ error: "This partner is suspended." }, { status: 409 });

  let invite;
  try {
    invite = await createPartnerInvite({ partnerId, email, name });
  } catch (err) {
    if (err instanceof PartnerAccountError) {
      return NextResponse.json({ error: err.message }, { status: err.code === "email_in_use" ? 409 : 400 });
    }
    throw err;
  }

  const link = `${process.env.NEXT_PUBLIC_APP_URL || "https://www.wgcpayments.com"}/partner/accept-invite/${invite.rawToken}`;
  const subject = `You've been invited to the ${partner.name} partner dashboard on WGC Payments`;
  const bodyHtml = `<p>You've been invited to manage the <strong>${escapeHtml(partner.name)}</strong> partner account on WGC Payments.</p>
               <p><a href="${link}">Accept the invitation and set your password</a></p>
               <p>This link works once and expires in ${PARTNER_INVITE_TTL_DAYS} days.</p>`;
  const emailResult = await sendWgcEmail({ to: email, subject, title: "You're invited", badgeText: "Partner Invitation", badgeColor: "#0B5DBC", bodyHtml });

  // The link is a one-time credential, so it is not kept in the email log.
  await prisma.emailLog.create({
    data: {
      type: "PARTNER_INVITE",
      to: email,
      subject,
      status: emailResult.success ? "SENT" : "ERROR",
      sentAt: emailResult.success ? new Date() : null,
      error: emailResult.success ? null : String(emailResult.error ?? "unknown error"),
      bodyHtml: "<p>Partner invitation (link not stored).</p>",
    },
  });
  await createAuditLog({
    action: "PARTNER_USER_INVITED",
    actorEmail: auth.session.email,
    metadata: { partnerId, partnerUserId: invite.userId, email, emailSent: emailResult.success },
  });

  if (!emailResult.success) {
    return NextResponse.json({ error: "The account was created, but the invitation email failed to send. Check Email Logs, then invite again." }, { status: 502 });
  }
  return NextResponse.json({ message: `Invitation sent to ${email}.` }, { status: 201 });
}
