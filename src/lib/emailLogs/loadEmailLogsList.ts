import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 25;

export interface EmailLogsListFilters {
  category?: string;
  status?: string;
  search?: string;
  from?: string;
  to?: string;
}

/**
 * Shared by both the merchant page (server-rendered) and the list API
 * route — one query definition, same pagination/summary shape either way.
 * The summary (totalSent / uniqueDonorsReached) is what answers "how many
 * donors has this actually gone to" for the current filter range.
 */
export async function loadEmailLogsList(churchId: string, filters: EmailLogsListFilters, page = 1) {
  const { category, status, search, from, to } = filters;

  const where: Prisma.OrgEmailLogWhereInput = {
    churchId,
    ...(category ? { category } : {}),
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { recipientEmail: { contains: search, mode: "insensitive" } },
            { recipientName: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        }
      : {}),
  };

  const [logs, total, totalSent, distinctDonors] = await Promise.all([
    prisma.orgEmailLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.orgEmailLog.count({ where }),
    prisma.orgEmailLog.count({ where: { ...where, status: "SENT" } }),
    prisma.orgEmailLog.findMany({ where: { ...where, status: "SENT", donorId: { not: null } }, select: { donorId: true }, distinct: ["donorId"] }),
  ]);

  return {
    logs,
    total,
    page,
    pageSize: PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    summary: { totalSent, uniqueDonorsReached: distinctDonors.length },
  };
}
