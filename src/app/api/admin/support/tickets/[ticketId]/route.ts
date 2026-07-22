import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { isValidCategory, isValidPriority } from "@/lib/support/ticketCategories";
import { TICKET_STATUSES } from "@/lib/support/ticketCategories";
import { notifyTicketStatusChange, notifyTicketResolved } from "@/lib/support/ticketNotifications";

export async function GET(_req: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ticketId } = await params;
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    // Internal admin view — internal notes ARE included here, unlike
    // every merchant-facing ticket query.
    include: { messages: { orderBy: { createdAt: "asc" }, include: { attachments: true } } },
  });
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  const [church, creator, assignedAdmin] = await Promise.all([
    prisma.church.findUnique({ where: { id: ticket.churchId }, select: { id: true, name: true } }),
    ticket.createdByUserId ? prisma.user.findUnique({ where: { id: ticket.createdByUserId }, select: { id: true, name: true, email: true, role: true } }) : Promise.resolve(null),
    ticket.assignedToAdminUserId ? prisma.user.findUnique({ where: { id: ticket.assignedToAdminUserId }, select: { id: true, name: true, email: true } }) : Promise.resolve(null),
  ]);

  // Mark unread merchant messages read now that an admin has opened this
  // ticket — best-effort, never blocks the response.
  const unreadMerchantMessageIds = ticket.messages
    .filter((m) => m.senderRole !== "wgc_admin" && !m.isInternalNote && !m.readByAdminAt)
    .map((m) => m.id);
  if (unreadMerchantMessageIds.length > 0) {
    await prisma.supportTicketMessage.updateMany({
      where: { id: { in: unreadMerchantMessageIds } },
      data: { readByAdminAt: new Date() },
    });
    await logDashboardAction({
      churchId: ticket.churchId,
      actorUserId: session.userId,
      actorEmail: session.email,
      actorRole: session.role,
      action: "support.ticket_read_by_admin",
      entityType: "support_ticket",
      entityId: ticket.id,
      metadata: { ticketNumber: ticket.ticketNumber },
    });
  }

  return NextResponse.json({ ticket, church, creator, assignedAdmin });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ticketId } = await params;
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  const data: Record<string, unknown> = {};
  let auditAction = "";
  let previousValue: unknown;
  let newValue: unknown;

  switch (action) {
    case "set_status": {
      const status = body.status;
      if (!TICKET_STATUSES.includes(status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      if (status === "RESOLVED" && (!body.resolutionSummary || typeof body.resolutionSummary !== "string" || body.resolutionSummary.trim() === "")) {
        return NextResponse.json({ error: "Missing resolutionSummary" }, { status: 400 });
      }
      data.status = status;
      if (status === "RESOLVED") data.resolvedAt = new Date();
      if (status === "CLOSED") data.closedAt = new Date();
      auditAction = "support.ticket_status_changed";
      previousValue = ticket.status;
      newValue = status;
      break;
    }
    case "set_priority": {
      if (!isValidPriority(body.priority)) {
        return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
      }
      data.priority = body.priority;
      auditAction = "support.ticket_priority_changed";
      previousValue = ticket.priority;
      newValue = body.priority;
      break;
    }
    case "set_category": {
      if (!isValidCategory(body.category)) {
        return NextResponse.json({ error: "Invalid category" }, { status: 400 });
      }
      data.category = body.category;
      auditAction = "support.ticket_category_changed";
      previousValue = ticket.category;
      newValue = body.category;
      break;
    }
    case "assign": {
      const adminUserId = typeof body.adminUserId === "string" ? body.adminUserId : "";
      const admin = await prisma.user.findUnique({ where: { id: adminUserId } });
      if (!admin || (admin.role !== "wgc_admin" && admin.role !== "wgc_super_admin") || admin.disabledAt) {
        return NextResponse.json({ error: "Invalid admin" }, { status: 400 });
      }
      data.assignedToAdminUserId = adminUserId;
      auditAction = "support.ticket_assigned";
      previousValue = ticket.assignedToAdminUserId;
      newValue = adminUserId;
      break;
    }
    case "unassign": {
      data.assignedToAdminUserId = null;
      auditAction = "support.ticket_unassigned";
      previousValue = ticket.assignedToAdminUserId;
      newValue = null;
      break;
    }
    case "resolve": {
      if (["RESOLVED", "CLOSED"].includes(ticket.status)) {
        return NextResponse.json({ error: "Ticket is already resolved or closed" }, { status: 400 });
      }
      if (!body.resolutionSummary || typeof body.resolutionSummary !== "string" || body.resolutionSummary.trim() === "") {
        return NextResponse.json({ error: "Missing resolutionSummary" }, { status: 400 });
      }
      data.status = "RESOLVED";
      data.resolvedAt = new Date();
      auditAction = "support.ticket_resolved";
      previousValue = ticket.status;
      newValue = "RESOLVED";
      break;
    }
    case "reopen": {
      // Per policy, reopening a CLOSED ticket must always be an explicit
      // admin action (never automatic) — this endpoint IS that explicit
      // action, so it's allowed here even from CLOSED.
      if (!["RESOLVED", "CLOSED"].includes(ticket.status)) {
        return NextResponse.json({ error: "Ticket is not resolved or closed" }, { status: 400 });
      }
      data.status = "IN_PROGRESS";
      data.resolvedAt = null;
      data.closedAt = null;
      auditAction = "support.ticket_reopened";
      previousValue = ticket.status;
      newValue = "IN_PROGRESS";
      break;
    }
    case "close": {
      if (ticket.status === "CLOSED") {
        return NextResponse.json({ error: "Ticket is already closed" }, { status: 400 });
      }
      data.status = "CLOSED";
      data.closedAt = new Date();
      auditAction = "support.ticket_closed";
      previousValue = ticket.status;
      newValue = "CLOSED";
      break;
    }
    default:
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const updated = await prisma.supportTicket.update({ where: { id: ticket.id }, data });

  // Status changes (including resolve/reopen/close, which are just status
  // shortcuts) are merchant-visible per spec ("See status changes").
  // Assignment, priority, and category are internal workflow metadata —
  // never shown to the merchant.
  const merchantVisibleActions = new Set(["set_status", "resolve", "reopen", "close"]);

  if (action === "resolve" || (action === "set_status" && body.status === "RESOLVED")) {
    await notifyTicketResolved(updated, body.resolutionSummary as string);
  } else if (merchantVisibleActions.has(action) && previousValue !== newValue) {
    const isReopen = action === "reopen" || (action === "set_status" && (previousValue === "RESOLVED" || previousValue === "CLOSED") && newValue !== "RESOLVED" && newValue !== "CLOSED");
    await notifyTicketStatusChange(updated, isReopen);
  }

  await prisma.supportTicketMessage.create({
    data: {
      ticketId: ticket.id,
      senderRole: "system",
      body: describeAction(action, body),
      isSystemEvent: true,
      isInternalNote: !merchantVisibleActions.has(action),
    },
  });

  await logDashboardAction({
    churchId: ticket.churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: auditAction,
    entityType: "support_ticket",
    entityId: ticket.id,
    metadata: { ticketNumber: ticket.ticketNumber, previousValue, newValue },
  });

  return NextResponse.json({ ticket: updated });
}

function describeAction(action: string, body: Record<string, unknown>): string {
  switch (action) {
    case "set_status":
      if (body.status === "RESOLVED" && body.resolutionSummary) {
        return `Ticket resolved.\n\nResolution Summary:\n${body.resolutionSummary}`;
      }
      return `Status changed to ${body.status}.`;
    case "set_priority":
      return `Priority changed to ${body.priority}.`;
    case "set_category":
      return `Category changed to ${body.category}.`;
    case "assign":
      return "Ticket assigned.";
    case "unassign":
      return "Ticket unassigned.";
    case "resolve":
      return `Ticket resolved.\n\nResolution Summary:\n${body.resolutionSummary}`;
    case "reopen":
      return "Ticket reopened.";
    case "close":
      return "Ticket closed.";
    default:
      return "Ticket updated.";
  }
}
