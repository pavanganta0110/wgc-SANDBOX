import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSupportPermissions } from "@/lib/support/supportPermissions";
import { isValidCategory, isValidPriority } from "@/lib/support/ticketCategories";
import { isValidEmail } from "@/lib/donors/donorContact";
import { normalizeWhitespace } from "@/lib/settings/settingsValidation";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { createSupportTicketWithNumber } from "@/lib/support/ticketNumber";
import { notifyNewSupportTicket } from "@/lib/support/ticketNotifications";

const PAGE_SIZE = 20;

export async function GET(req: Request) {
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

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);

  // Team-access Checkpoint 4D: FUNDRAISER only sees tickets they created —
  // creator attribution exists via SupportTicket.createdByUserId.
  const where: any = { churchId: auth.churchId, ...(permissions.canViewAllTickets ? {} : { createdByUserId: auth.userId }) };
  if (status === "OPEN") where.status = { notIn: ["RESOLVED", "CLOSED"] };
  else if (status === "CLOSED") where.status = { in: ["RESOLVED", "CLOSED"] };

  const [tickets, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.supportTicket.count({ where }),
  ]);

  // Unread WGC-reply indicator per ticket — a merchant-visible message
  // from WGC (not an internal note, which the merchant API never returns
  // at all) that this merchant hasn't opened the ticket to see yet.
  const ticketIds = tickets.map((t) => t.id);
  const unreadCounts = ticketIds.length
    ? await prisma.supportTicketMessage.groupBy({
        by: ["ticketId"],
        where: { ticketId: { in: ticketIds }, senderRole: "wgc_admin", isInternalNote: false, readByMerchantAt: null },
        _count: { _all: true },
      })
    : [];
  const unreadByTicket = new Map(unreadCounts.map((c) => [c.ticketId, c._count._all]));

  const ticketsWithUnread = tickets.map((t) => ({ ...t, unreadCount: unreadByTicket.get(t.id) ?? 0 }));

  return NextResponse.json({ tickets: ticketsWithUnread, total, page, pageSize: PAGE_SIZE });
}

export async function POST(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getSupportPermissions(auth.rawRole);
  if (!permissions.canCreateTicket) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const subject = normalizeWhitespace(body.subject);
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const category = body.category;
  const priority = body.priority || "NORMAL";

  if (!subject) return NextResponse.json({ error: "Subject is required" }, { status: 400 });
  if (!description) return NextResponse.json({ error: "Description is required" }, { status: 400 });
  if (!isValidCategory(category)) return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  if (!isValidPriority(priority)) return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
  if (body.contactEmail && !isValidEmail(body.contactEmail)) {
    return NextResponse.json({ error: "Invalid contact email" }, { status: 400 });
  }

  const ticket = await createSupportTicketWithNumber({
    churchId: auth.churchId,
    subject,
    category,
    description,
    priority,
    preferredContactMethod: body.preferredContactMethod === "PHONE" ? "PHONE" : body.preferredContactMethod === "EMAIL" ? "EMAIL" : null,
    contactEmail: normalizeWhitespace(body.contactEmail),
    contactPhone: normalizeWhitespace(body.contactPhone),
    relatedResourceType: normalizeWhitespace(body.relatedResourceType),
    relatedResourceId: normalizeWhitespace(body.relatedResourceId),
    diagnosticConsent: !!body.diagnosticConsent,
    createdByUserId: auth.userId,
    createdByEmail: auth.email,
  });

  // Unread for WGC support from the moment it's created (readByAdminAt
  // stays null until an internal admin opens the ticket).
  await prisma.supportTicketMessage.create({
    data: {
      ticketId: ticket.id,
      senderRole: auth.rawRole,
      senderUserId: auth.userId,
      senderEmail: auth.email,
      body: description,
    },
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "support.ticket_created",
    entityType: "support_ticket",
    entityId: ticket.id,
    metadata: { category, priority, ticketNumber: ticket.ticketNumber },
    req,
  });

  // Best-effort — an email failure must never lose the ticket or the
  // message, which are already committed above.
  await notifyNewSupportTicket(ticket);

  return NextResponse.json({ ticket }, { status: 201 });
}
