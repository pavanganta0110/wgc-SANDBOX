import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSupportPermissions } from "@/lib/support/supportPermissions";
import { isValidCategory, isValidPriority } from "@/lib/support/ticketCategories";
import { isValidEmail } from "@/lib/donors/donorContact";
import { normalizeWhitespace } from "@/lib/settings/settingsValidation";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";

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

  return NextResponse.json({ tickets, total, page, pageSize: PAGE_SIZE });
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

  const ticket = await prisma.supportTicket.create({
    data: {
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
    },
  });

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
    metadata: { category, priority },
    req,
  });

  return NextResponse.json({ ticket }, { status: 201 });
}
