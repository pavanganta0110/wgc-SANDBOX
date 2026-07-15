import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getSupportPermissions } from "@/lib/support/supportPermissions";
import { logDashboardAction } from "@/lib/dashboardAudit";

export async function GET(_req: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;
  const session = await getSession();
  const permissions = getSupportPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canView) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: { messages: { orderBy: { createdAt: "asc" }, include: { attachments: true } } },
  });
  if (!ticket || ticket.churchId !== session.churchId) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  return NextResponse.json({ ticket });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;
  const session = await getSession();
  const permissions = getSupportPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canCloseReopen) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket || ticket.churchId !== session.churchId) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  const body = await req.json();
  const action = body.action as "close" | "reopen";
  if (action !== "close" && action !== "reopen") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  if (action === "close" && ["RESOLVED", "CLOSED"].includes(ticket.status)) {
    return NextResponse.json({ error: "Ticket is already closed" }, { status: 400 });
  }
  if (action === "reopen" && !["RESOLVED", "CLOSED"].includes(ticket.status)) {
    return NextResponse.json({ error: "Ticket is not closed" }, { status: 400 });
  }

  const newStatus = action === "close" ? "CLOSED" : "OPEN";
  const updated = await prisma.supportTicket.update({
    where: { id: ticket.id },
    data: {
      status: newStatus,
      closedAt: action === "close" ? new Date() : null,
    },
  });

  await prisma.supportTicketMessage.create({
    data: {
      ticketId: ticket.id,
      senderRole: session.role,
      senderUserId: session.userId,
      senderEmail: session.email,
      body: action === "close" ? "Ticket closed." : "Ticket reopened.",
      isSystemEvent: true,
    },
  });

  await logDashboardAction({
    churchId: session.churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: action === "close" ? "support.ticket_closed" : "support.ticket_reopened",
    entityType: "support_ticket",
    entityId: ticket.id,
    req,
  });

  return NextResponse.json({ ticket: updated });
}
