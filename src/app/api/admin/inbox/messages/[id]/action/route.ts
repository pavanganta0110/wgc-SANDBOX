import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMfaVerifiedAdminSession } from "@/lib/auth/requireAdminSession";
import { isAuthError } from "@/lib/auth/errors";
import { createTicketFromInboxMessage } from "@/lib/inbox/tickets";
import { canAccessMailbox } from "@/lib/inbox/access";

type Params = { params: Promise<{ id: string }> };

async function saveRule(kind: "BLOCK" | "ALLOW", pattern: string, adminEmail: string) {
  await prisma.inboxSenderRule.upsert({ where: { pattern }, create: { kind, pattern, createdByEmail: adminEmail }, update: { kind, createdByEmail: adminEmail } });
}

/** Admin triage: make_ticket | spam | not_spam | ignore | assign_me. */
export async function POST(req: Request, { params }: Params) {
  try {
    const session = await requireMfaVerifiedAdminSession();
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { action?: unknown; churchId?: unknown };
    const msg = await prisma.inboxMessage.findUnique({ where: { id }, include: { mailbox: { select: { ownerAdminUserId: true } } } });
    // Someone else's personal mail looks exactly like a message that doesn't exist.
    if (!msg || !canAccessMailbox(msg.mailbox, session.userId)) return NextResponse.json({ error: "Message not found" }, { status: 404 });
    if (msg.mailbox.ownerAdminUserId && ["spam", "not_spam", "assign_me"].includes(String(body.action))) {
      return NextResponse.json({ error: "Not available for a personal mailbox." }, { status: 400 });
    }

    switch (body.action) {
      case "make_ticket": {
        const churchId = typeof body.churchId === "string" ? body.churchId : msg.churchId;
        if (!churchId) return NextResponse.json({ error: "Pick the organization this ticket is for." }, { status: 400 });
        const church = await prisma.church.findUnique({ where: { id: churchId }, select: { id: true } });
        if (!church) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
        const r = await createTicketFromInboxMessage(id, church.id, session.email);
        await prisma.inboxMessage.update({ where: { id }, data: { classification: "SUPPORT" } });
        return NextResponse.json({ success: true, ...r });
      }
      case "spam":
        await prisma.inboxMessage.update({ where: { id }, data: { classification: "SPAM", classificationReason: `Marked spam by ${session.email}`, status: "HANDLED", handledByAdminEmail: session.email } });
        await saveRule("BLOCK", msg.fromEmail, session.email);
        return NextResponse.json({ success: true });
      case "not_spam":
        await prisma.inboxMessage.update({ where: { id }, data: { classification: "NEEDS_REVIEW", classificationReason: `Marked not spam by ${session.email}`, status: "NEW" } });
        await saveRule("ALLOW", msg.fromEmail, session.email);
        return NextResponse.json({ success: true });
      case "ignore":
        await prisma.inboxMessage.update({ where: { id }, data: { status: "IGNORED", handledByAdminEmail: session.email } });
        return NextResponse.json({ success: true });
      case "assign_me":
        await prisma.inboxMessage.update({ where: { id }, data: { assignedToAdminEmail: session.email } });
        return NextResponse.json({ success: true });
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("inbox action failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}
