import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMfaVerifiedAdminSession } from "@/lib/auth/requireAdminSession";
import { isAuthError } from "@/lib/auth/errors";
import { accessTokenForMailbox, mailboxDataCenter } from "@/lib/inbox/mailboxAuth";
import { sendMail } from "@/lib/inbox/zoho";
import { canAccessMailbox } from "@/lib/inbox/access";

type Params = { params: Promise<{ id: string }> };

/** Replies to the sender through Zoho (so it comes from the support address and lands in Zoho's Sent folder). */
export async function POST(req: Request, { params }: Params) {
  try {
    const session = await requireMfaVerifiedAdminSession();
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { text?: unknown };
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) return NextResponse.json({ error: "Write a reply first." }, { status: 400 });
    if (text.length > 10000) return NextResponse.json({ error: "Reply is too long." }, { status: 400 });

    const msg = await prisma.inboxMessage.findUnique({ where: { id }, include: { mailbox: true } });
    if (!msg || !canAccessMailbox(msg.mailbox, session.userId)) return NextResponse.json({ error: "Message not found" }, { status: 404 });
    const ticket = msg.ticketId ? await prisma.supportTicket.findUnique({ where: { id: msg.ticketId }, select: { id: true, ticketNumber: true } }) : null;

    const base = msg.subject.replace(/^(re:\s*)+/i, "");
    const subject = `Re: ${base}${ticket && !base.includes(ticket.ticketNumber) ? ` [${ticket.ticketNumber}]` : ""}`;
    const dc = mailboxDataCenter(msg.mailbox);
    const token = await accessTokenForMailbox(msg.mailbox);
    const sentId = await sendMail(token, dc, msg.mailbox.providerAccountId, { from: msg.mailbox.emailAddress, to: msg.fromEmail, subject, text });

    await prisma.inboxMessage.create({
      data: {
        mailboxId: msg.mailboxId, providerMessageId: sentId ?? `out-${Date.now()}-${msg.id}`, direction: "OUT", fromEmail: msg.mailbox.emailAddress, toEmail: msg.fromEmail,
        subject, bodyText: text, receivedAt: new Date(), classification: "SUPPORT", classificationReason: `Reply sent by ${session.email}`, status: "HANDLED",
        churchId: msg.churchId, ticketId: msg.ticketId, handledByAdminEmail: session.email,
      },
    });
    await prisma.inboxMessage.update({ where: { id }, data: { status: msg.ticketId ? "TICKETED" : "HANDLED", handledByAdminEmail: session.email } });
    if (ticket) {
      await prisma.supportTicketMessage.create({ data: { ticketId: ticket.id, senderRole: "wgc_admin", senderEmail: session.email, body: text, readByAdminAt: new Date() } });
    }
    await prisma.auditLog.create({ data: { action: "ADMIN_INBOX_REPLY", actorEmail: session.email, metadata: { inboxMessageId: id, ticketId: msg.ticketId } } });
    return NextResponse.json({ success: true });
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("inbox reply failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Could not send the reply" }, { status: 500 });
  }
}
