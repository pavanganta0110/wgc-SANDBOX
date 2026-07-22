import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { notifyWgcReply } from "@/lib/support/ticketNotifications";

export async function POST(req: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ticketId } = await params;
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const messageBody = typeof body.body === "string" ? body.body.trim() : "";
  const isInternalNote = Boolean(body.isInternalNote);

  if (!messageBody) {
    return NextResponse.json({ error: "Enter a message" }, { status: 400 });
  }

  const message = await prisma.supportTicketMessage.create({
    data: {
      ticketId: ticket.id,
      senderRole: "wgc_admin",
      senderUserId: session.userId,
      senderEmail: session.email,
      body: messageBody,
      isInternalNote,
    },
  });

  const updateData: Record<string, unknown> = {};
  if (!isInternalNote && !["RESOLVED", "CLOSED"].includes(ticket.status)) {
    // A merchant-visible WGC reply is the "the ball is back in the
    // organization's court" signal — internal notes never change status.
    updateData.status = "WAITING_ON_ORGANIZATION";
  }
  const updatedTicket = Object.keys(updateData).length
    ? await prisma.supportTicket.update({ where: { id: ticket.id }, data: updateData })
    : ticket;

  await logDashboardAction({
    churchId: ticket.churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: isInternalNote ? "support.internal_note_added" : "support.wgc_reply_added",
    entityType: "support_ticket",
    entityId: ticket.id,
    metadata: { ticketNumber: ticket.ticketNumber },
  });

  // Best-effort — an internal note is never emailed (isInternalNote guards
  // this entirely: notifyWgcReply is simply never called for one). A
  // failed send must never remove or duplicate the already-committed reply.
  if (!isInternalNote) {
    await notifyWgcReply(updatedTicket, messageBody);
  }

  return NextResponse.json({ message, ticket: updatedTicket }, { status: 201 });
}
