import { prisma } from "@/lib/prisma";
import type { Client, Prisma } from "@prisma/client";
import { normalizeEmail, normalizePhone } from "@/lib/donors/donorContact";

export interface ClientAggregates {
  totalInvoicedCents: number;
  totalPaidCents: number;
  outstandingBalanceCents: number;
  invoiceCount: number;
  lastInvoiceDate: Date | null;
}

export interface ClientsListFilters {
  search?: string;
  archivedStatus?: "active" | "archived" | "all";
  clientType?: "INDIVIDUAL" | "ORGANIZATION";
}

export interface ClientsListSort {
  key: "createdAt" | "displayName" | "totalInvoicedCents" | "outstandingBalanceCents";
  dir: "asc" | "desc";
}

export interface ClientListRow {
  client: Client;
  aggregates: ClientAggregates;
}

const EMPTY_AGGREGATES: ClientAggregates = { totalInvoicedCents: 0, totalPaidCents: 0, outstandingBalanceCents: 0, invoiceCount: 0, lastInvoiceDate: null };

/** Batch-computes invoice aggregates for a set of clients in one grouped
 * query, mirroring loadDonorAggregatesBatch's "never store, always compute
 * on read" approach — an invoice's totals are the source of truth, never
 * duplicated onto the Client row where they could drift. */
export async function loadClientAggregatesBatch(clientIds: string[]): Promise<Map<string, ClientAggregates>> {
  const result = new Map<string, ClientAggregates>();
  if (clientIds.length === 0) return result;

  const invoices = await prisma.invoice.findMany({
    where: { clientId: { in: clientIds }, status: { not: "VOID" } },
    select: { clientId: true, totalCents: true, amountPaidCents: true, balanceCents: true, createdAt: true },
  });

  for (const invoice of invoices) {
    const existing = result.get(invoice.clientId) ?? { ...EMPTY_AGGREGATES };
    existing.totalInvoicedCents += invoice.totalCents;
    existing.totalPaidCents += invoice.amountPaidCents;
    existing.outstandingBalanceCents += invoice.balanceCents;
    existing.invoiceCount += 1;
    if (!existing.lastInvoiceDate || invoice.createdAt > existing.lastInvoiceDate) existing.lastInvoiceDate = invoice.createdAt;
    result.set(invoice.clientId, existing);
  }
  return result;
}

const PAGE_SIZE = 25;

export async function loadClientsList(
  churchId: string,
  filters: ClientsListFilters,
  sort: ClientsListSort,
  page: number,
  pageSize = PAGE_SIZE
): Promise<{ rows: ClientListRow[]; totalCount: number }> {
  const where: Prisma.ClientWhereInput = {
    churchId,
    ...(filters.archivedStatus === "archived" ? { archivedAt: { not: null } } : filters.archivedStatus === "all" ? {} : { archivedAt: null }),
    ...(filters.clientType ? { clientType: filters.clientType } : {}),
  };

  if (filters.search?.trim()) {
    const search = filters.search.trim();
    const normalizedEmail = normalizeEmail(search);
    const normalizedPhone = normalizePhone(search);
    where.OR = [
      { displayName: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { organizationName: { contains: search, mode: "insensitive" } },
      ...(normalizedEmail ? [{ normalizedEmail }] : []),
      ...(normalizedPhone ? [{ normalizedPhone }] : []),
    ];
  }

  const totalCount = await prisma.client.count({ where });

  // Aggregate-dependent sorts (totalInvoicedCents, outstandingBalanceCents)
  // can't be expressed in SQL against Client directly since nothing is
  // cached there — same tradeoff as donorsList.ts: fetch a bounded
  // candidate set, compute aggregates, sort/paginate in memory.
  const isAggregateSort = sort.key === "totalInvoicedCents" || sort.key === "outstandingBalanceCents";

  if (!isAggregateSort) {
    const orderBy: Prisma.ClientOrderByWithRelationInput = { [sort.key]: sort.dir };
    const clients = await prisma.client.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize });
    const aggregates = await loadClientAggregatesBatch(clients.map((c) => c.id));
    return { rows: clients.map((client) => ({ client, aggregates: aggregates.get(client.id) ?? EMPTY_AGGREGATES })), totalCount };
  }

  const CANDIDATE_CAP = 2000;
  const candidates = await prisma.client.findMany({ where, take: CANDIDATE_CAP });
  const aggregates = await loadClientAggregatesBatch(candidates.map((c) => c.id));
  const withAggregates = candidates.map((client) => ({ client, aggregates: aggregates.get(client.id) ?? EMPTY_AGGREGATES }));
  const aggregateKey = sort.key as "totalInvoicedCents" | "outstandingBalanceCents";
  withAggregates.sort((a, b) => {
    const diff = a.aggregates[aggregateKey] - b.aggregates[aggregateKey];
    return sort.dir === "asc" ? diff : -diff;
  });
  const start = (page - 1) * pageSize;
  return { rows: withAggregates.slice(start, start + pageSize), totalCount: Math.min(totalCount, CANDIDATE_CAP) };
}
