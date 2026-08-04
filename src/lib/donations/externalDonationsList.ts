import { prisma } from "@/lib/prisma";
import type { ExternalDonation, Prisma } from "@prisma/client";

export interface ExternalDonationsListFilters {
  search?: string;
  paymentMethod?: string;
  receiptStatus?: string;
  isTaxDeductible?: boolean;
  addedByUserId?: string;
  importedOnly?: boolean;
  manualOnly?: boolean;
  donationDateFrom?: Date;
  donationDateTo?: Date;
  /** Fundraiser/viewer scoping — undefined means organization-wide. */
  scopedToUserId?: string;
  /** Defaults to hiding voided rows unless explicitly requested. */
  includeVoided?: boolean;
}

const PAGE_SIZE = 25;

function buildWhere(churchId: string, filters: ExternalDonationsListFilters, donorIdsMatchingSearch: string[] | null): Prisma.ExternalDonationWhereInput {
  const where: Prisma.ExternalDonationWhereInput = {
    churchId,
    ...(filters.scopedToUserId ? { createdByUserId: filters.scopedToUserId } : {}),
    ...(filters.paymentMethod ? { paymentMethod: filters.paymentMethod } : {}),
    ...(filters.receiptStatus ? { receiptStatus: filters.receiptStatus === "NOT_SENT" ? null : filters.receiptStatus } : {}),
    ...(filters.isTaxDeductible != null ? { isTaxDeductible: filters.isTaxDeductible } : {}),
    ...(filters.addedByUserId ? { createdByUserId: filters.addedByUserId } : {}),
    ...(filters.importedOnly ? { importBatchId: { not: null } } : {}),
    ...(filters.manualOnly ? { importBatchId: null } : {}),
    ...(!filters.includeVoided ? { status: { not: "VOIDED" } } : {}),
    ...(filters.donationDateFrom || filters.donationDateTo
      ? {
          donationDate: {
            ...(filters.donationDateFrom ? { gte: filters.donationDateFrom } : {}),
            ...(filters.donationDateTo ? { lte: filters.donationDateTo } : {}),
          },
        }
      : {}),
  };

  if (filters.search?.trim()) {
    const search = filters.search.trim();
    where.OR = [
      { fundName: { contains: search, mode: "insensitive" } },
      { campaign: { contains: search, mode: "insensitive" } },
      { checkNumber: { contains: search, mode: "insensitive" } },
      { externalTransactionId: { contains: search, mode: "insensitive" } },
      { confirmationNumber: { contains: search, mode: "insensitive" } },
      ...(donorIdsMatchingSearch && donorIdsMatchingSearch.length ? [{ donorId: { in: donorIdsMatchingSearch } }] : []),
    ];
  }

  return where;
}

export async function loadExternalDonationsList(
  churchId: string,
  filters: ExternalDonationsListFilters,
  page: number,
  pageSize = PAGE_SIZE
): Promise<{ rows: ExternalDonation[]; totalCount: number }> {
  let donorIdsMatchingSearch: string[] | null = null;
  if (filters.search?.trim()) {
    const matches = await prisma.donor.findMany({
      where: {
        churchId,
        OR: [{ name: { contains: filters.search.trim(), mode: "insensitive" } }, { email: { contains: filters.search.trim(), mode: "insensitive" } }],
      },
      select: { id: true },
      take: 200,
    });
    donorIdsMatchingSearch = matches.map((d) => d.id);
  }

  const where = buildWhere(churchId, filters, donorIdsMatchingSearch);
  const totalCount = await prisma.externalDonation.count({ where });
  const rows = await prisma.externalDonation.findMany({
    where,
    orderBy: { donationDate: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  return { rows, totalCount };
}

/** Same filters, unpaginated — used by the CSV export route. Capped so an
 * export can never silently pull an unbounded number of rows. */
export const EXPORT_ROW_CAP = 20000;

export async function loadExternalDonationsForExport(churchId: string, filters: ExternalDonationsListFilters): Promise<ExternalDonation[]> {
  let donorIdsMatchingSearch: string[] | null = null;
  if (filters.search?.trim()) {
    const matches = await prisma.donor.findMany({
      where: {
        churchId,
        OR: [{ name: { contains: filters.search.trim(), mode: "insensitive" } }, { email: { contains: filters.search.trim(), mode: "insensitive" } }],
      },
      select: { id: true },
      take: 200,
    });
    donorIdsMatchingSearch = matches.map((d) => d.id);
  }
  const where = buildWhere(churchId, filters, donorIdsMatchingSearch);
  return prisma.externalDonation.findMany({ where, orderBy: { donationDate: "desc" }, take: EXPORT_ROW_CAP });
}

export interface ExternalDonationSummary {
  totalCount: number;
  totalAmountCents: number;
  receiptSent: number;
  receiptNotSent: number;
  receiptFailed: number;
}

export async function loadExternalDonationSummary(churchId: string, filters: ExternalDonationsListFilters): Promise<ExternalDonationSummary> {
  const where = buildWhere(churchId, filters, null);
  const [total, sent, notSent, failed] = await Promise.all([
    prisma.externalDonation.aggregate({ where, _count: { _all: true }, _sum: { donationAmountCents: true } }),
    prisma.externalDonation.count({ where: { ...where, receiptStatus: { in: ["SENT", "RESENT"] } } }),
    prisma.externalDonation.count({ where: { ...where, OR: [{ receiptStatus: null }, { receiptStatus: "NOT_SENT" }] } }),
    prisma.externalDonation.count({ where: { ...where, receiptStatus: "FAILED" } }),
  ]);
  return {
    totalCount: total._count._all,
    totalAmountCents: total._sum.donationAmountCents ?? 0,
    receiptSent: sent,
    receiptNotSent: notSent,
    receiptFailed: failed,
  };
}
