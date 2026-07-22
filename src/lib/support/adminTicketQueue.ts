import { prisma } from "@/lib/prisma";

export interface AdminTicketQueueFilters {
  status?: string;
  priority?: string;
  category?: string;
  churchId?: string;
  assignedToAdminUserId?: string | "unassigned";
  search?: string;
}

const PAGE_SIZE = 25;

/**
 * The internal admin ticket queue — organization-wide, no church scoping
 * (unlike every merchant-facing ticket query). Search matches ticket
 * number, subject, organization name, or the creator's email; each is a
 * separate condition ORed together rather than one combined string match,
 * since they live on different tables/fields.
 */
export async function loadAdminTicketQueue(filters: AdminTicketQueueFilters, page: number) {
  const where: Record<string, unknown> = {};
  if (filters.status === "OPEN") where.status = { notIn: ["RESOLVED", "CLOSED"] };
  else if (filters.status === "CLOSED") where.status = { in: ["RESOLVED", "CLOSED"] };
  else if (filters.status) where.status = filters.status;
  if (filters.priority) where.priority = filters.priority;
  if (filters.category) where.category = filters.category;
  if (filters.churchId) where.churchId = filters.churchId;
  if (filters.assignedToAdminUserId === "unassigned") where.assignedToAdminUserId = null;
  else if (filters.assignedToAdminUserId) where.assignedToAdminUserId = filters.assignedToAdminUserId;

  if (filters.search) {
    const search = filters.search.trim();
    const matchingChurches = await prisma.church.findMany({
      where: { name: { contains: search, mode: "insensitive" } },
      select: { id: true },
      take: 50,
    });
    where.OR = [
      { ticketNumber: { contains: search, mode: "insensitive" } },
      { subject: { contains: search, mode: "insensitive" } },
      { createdByEmail: { contains: search, mode: "insensitive" } },
      ...(matchingChurches.length ? [{ churchId: { in: matchingChurches.map((c) => c.id) } }] : []),
    ];
  }

  const [tickets, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.supportTicket.count({ where }),
  ]);

  const churchIds = [...new Set(tickets.map((t) => t.churchId))];
  const adminIds = [...new Set(tickets.map((t) => t.assignedToAdminUserId).filter((id): id is string => Boolean(id)))];
  const ticketIds = tickets.map((t) => t.id);

  const [churches, admins, unreadCounts] = await Promise.all([
    churchIds.length ? prisma.church.findMany({ where: { id: { in: churchIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    adminIds.length ? prisma.user.findMany({ where: { id: { in: adminIds } }, select: { id: true, name: true, email: true } }) : Promise.resolve([]),
    ticketIds.length
      ? prisma.supportTicketMessage.groupBy({
          by: ["ticketId"],
          where: { ticketId: { in: ticketIds }, senderRole: { not: "wgc_admin" }, isInternalNote: false, readByAdminAt: null },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);
  const churchMap = new Map(churches.map((c) => [c.id, c.name]));
  const adminMap = new Map(admins.map((a) => [a.id, a.name || a.email]));
  const unreadMap = new Map(unreadCounts.map((c) => [c.ticketId, c._count._all]));

  const rows = tickets.map((t) => ({
    ...t,
    organizationName: churchMap.get(t.churchId) || "Unknown Organization",
    assignedAdminName: t.assignedToAdminUserId ? adminMap.get(t.assignedToAdminUserId) || "Unknown" : null,
    unreadCount: unreadMap.get(t.id) ?? 0,
  }));

  return { rows, total, page, pageSize: PAGE_SIZE };
}

export interface AdminTicketSummary {
  openCount: number;
  unreadMerchantReplyCount: number;
}

/** Powers the admin dashboard's ticket KPIs — open-ticket count and
 * unread-merchant-reply count, org-wide. */
export async function loadAdminTicketSummary(): Promise<AdminTicketSummary> {
  const [openCount, unreadTickets] = await Promise.all([
    prisma.supportTicket.count({ where: { status: { notIn: ["RESOLVED", "CLOSED"] } } }),
    prisma.supportTicketMessage.groupBy({
      by: ["ticketId"],
      where: { senderRole: { not: "wgc_admin" }, isInternalNote: false, readByAdminAt: null },
      _count: { _all: true },
    }),
  ]);
  return { openCount, unreadMerchantReplyCount: unreadTickets.length };
}
