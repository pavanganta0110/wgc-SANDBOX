import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSupportPermissions } from "@/lib/support/supportPermissions";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";

export async function GET(_req: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getSupportPermissions(auth.rawRole);
  if (!permissions.canView) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: { messages: { orderBy: { createdAt: "asc" }, include: { attachments: true } } },
  });
  // Team-access Checkpoint 4D: FUNDRAISER (canViewAllTickets=false) may
  // only open a ticket they created — same-church alone isn't enough.
  if (!ticket || ticket.churchId !== auth.churchId || (!permissions.canViewAllTickets && ticket.createdByUserId !== auth.userId)) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  return NextResponse.json({ ticket });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getSupportPermissions(auth.rawRole);
  if (!permissions.canCloseReopen) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket || ticket.churchId !== auth.churchId || (!permissions.canViewAllTickets && ticket.createdByUserId !== auth.userId)) {
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
      senderRole: auth.rawRole,
      senderUserId: auth.userId,
      senderEmail: auth.email,
      body: action === "close" ? "Ticket closed." : "Ticket reopened.",
      isSystemEvent: true,
    },
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: action === "close" ? "support.ticket_closed" : "support.ticket_reopened",
    entityType: "support_ticket",
    entityId: ticket.id,
    req,
  });

  return NextResponse.json({ ticket: updated });
}
