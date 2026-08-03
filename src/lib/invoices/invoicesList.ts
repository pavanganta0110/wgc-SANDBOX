import { prisma } from "@/lib/prisma";
import type { Invoice, Prisma } from "@prisma/client";

export interface InvoicesListFilters {
  search?: string;
  status?: string;
  classification?: string;
  createdByUserId?: string;
  issueDateFrom?: Date;
  issueDateTo?: Date;
  dueDateFrom?: Date;
  dueDateTo?: Date;
  /** Fundraiser/viewer scoping — undefined means organization-wide (owner/admin). */
  scopedToUserId?: string;
}

export interface InvoicesListSort {
  key: "createdAt" | "dueDate" | "totalCents" | "balanceCents" | "status";
  dir: "asc" | "desc";
}

const PAGE_SIZE = 25;

export async function loadInvoicesList(
  churchId: string,
  filters: InvoicesListFilters,
  sort: InvoicesListSort,
  page: number,
  pageSize = PAGE_SIZE
): Promise<{ rows: (Invoice & { clientDisplayName: string })[]; totalCount: number }> {
  const where: Prisma.InvoiceWhereInput = {
    churchId,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.classification ? { classification: filters.classification } : {}),
    ...(filters.createdByUserId ? { createdByUserId: filters.createdByUserId } : {}),
    ...(filters.scopedToUserId ? { createdByUserId: filters.scopedToUserId } : {}),
    ...(filters.issueDateFrom || filters.issueDateTo
      ? { issueDate: { ...(filters.issueDateFrom ? { gte: filters.issueDateFrom } : {}), ...(filters.issueDateTo ? { lte: filters.issueDateTo } : {}) } }
      : {}),
    ...(filters.dueDateFrom || filters.dueDateTo
      ? { dueDate: { ...(filters.dueDateFrom ? { gte: filters.dueDateFrom } : {}), ...(filters.dueDateTo ? { lte: filters.dueDateTo } : {}) } }
      : {}),
  };

  if (filters.search?.trim()) {
    const search = filters.search.trim();
    const matchingClients = await prisma.client.findMany({
      where: { churchId, OR: [{ displayName: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }] },
      select: { id: true },
      take: 200,
    });
    where.OR = [
      { invoiceNumber: { contains: search, mode: "insensitive" } },
      { clientMemo: { contains: search, mode: "insensitive" } },
      { title: { contains: search, mode: "insensitive" } },
      ...(matchingClients.length ? [{ clientId: { in: matchingClients.map((c) => c.id) } }] : []),
    ];
  }

  const totalCount = await prisma.invoice.count({ where });
  const orderBy: Prisma.InvoiceOrderByWithRelationInput = { [sort.key]: sort.dir };
  const invoices = await prisma.invoice.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize });

  const clientIds = [...new Set(invoices.map((i) => i.clientId))];
  const clients = clientIds.length ? await prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, displayName: true } }) : [];
  const clientNameById = new Map(clients.map((c) => [c.id, c.displayName]));

  return {
    rows: invoices.map((invoice) => ({ ...invoice, clientDisplayName: clientNameById.get(invoice.clientId) ?? "Unknown client" })),
    totalCount,
  };
}

export interface InvoiceSummaryCards {
  draftCount: number;
  outstandingCents: number;
  pastDueCents: number;
  partiallyPaidCount: number;
  paidThisMonthCents: number;
  totalOutstandingCents: number;
}

export async function loadInvoiceSummaryCards(churchId: string, scopedToUserId?: string): Promise<InvoiceSummaryCards> {
  const baseWhere: Prisma.InvoiceWhereInput = { churchId, ...(scopedToUserId ? { createdByUserId: scopedToUserId } : {}) };
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [draftCount, outstanding, pastDue, partiallyPaidCount, paidThisMonth] = await Promise.all([
    prisma.invoice.count({ where: { ...baseWhere, status: "DRAFT" } }),
    prisma.invoice.aggregate({ where: { ...baseWhere, status: { in: ["SENT", "VIEWED", "PARTIALLY_PAID", "PAST_DUE"] } }, _sum: { balanceCents: true } }),
    prisma.invoice.aggregate({ where: { ...baseWhere, status: "PAST_DUE" }, _sum: { balanceCents: true } }),
    prisma.invoice.count({ where: { ...baseWhere, status: "PARTIALLY_PAID" } }),
    prisma.invoice.aggregate({ where: { ...baseWhere, status: "PAID", paidAt: { gte: startOfMonth } }, _sum: { totalCents: true } }),
  ]);

  return {
    draftCount,
    outstandingCents: outstanding._sum.balanceCents ?? 0,
    pastDueCents: pastDue._sum.balanceCents ?? 0,
    partiallyPaidCount,
    paidThisMonthCents: paidThisMonth._sum.totalCents ?? 0,
    totalOutstandingCents: outstanding._sum.balanceCents ?? 0,
  };
}
