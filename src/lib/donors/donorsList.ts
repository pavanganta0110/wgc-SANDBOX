import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { loadDonorAggregatesBatch, type DonorAggregates, type DateRangeFilter } from "@/lib/donors/donorAggregates";
import { loadDonorRiskSignals } from "@/lib/donors/donorRiskSignals";
import { resolveDonorDisplayStatus, type DonorDisplayStatus } from "@/lib/donors/donorStatus";
import { normalizeEmail, normalizePhone } from "@/lib/donors/donorContact";

/**
 * Aggregate-dependent filters/sorts (total donated, donation count, status,
 * recurring, has-refund/return/dispute/failed-payment) can't be expressed as
 * SQL on the Donor table itself since nothing is cached there — Donor
 * financials are always computed on read (see donorAggregates.ts) rather
 * than stored and risking drift. So this loader fetches a bounded candidate
 * set from the DB (base filters only), computes aggregates for that set in
 * one batch, then applies aggregate filters/sort/pagination in memory. This
 * mirrors the existing take-N-then-filter pattern already used by
 * loadDisputesList (take: 300) — the cap here is larger since Donors needs
 * real pagination controls, but the same honest tradeoff applies: an
 * organization with more than DONOR_CANDIDATE_CAP donors matching the base
 * filters will not see every one reflected in aggregate-based
 * filters/sorting. Not a client-side full-history load (this all happens in
 * one server request, one request-scoped batch of queries) and not silently
 * unbounded either.
 */
export const DONOR_CANDIDATE_CAP = 2000;

export interface DonorsListFilters {
  search?: string;
  createdDateFilter?: DateRangeFilter;
  firstDonationDateFilter?: DateRangeFilter;
  lastDonationDateFilter?: DateRangeFilter;
  donorStatus?: DonorDisplayStatus;
  recurringOnly?: boolean;
  paymentMethod?: "card" | "bank";
  minTotalDonatedCents?: number;
  maxTotalDonatedCents?: number;
  minDonationCount?: number;
  maxDonationCount?: number;
  fundId?: string;
  givingLinkId?: string;
  hasFailedPayment?: boolean;
  hasRefund?: boolean;
  hasBankReturn?: boolean;
  hasDispute?: boolean;
  hasActiveSubscription?: boolean;
  archivedStatus?: "active" | "archived" | "all";
}

export interface DonorsListSort {
  key: "createdAt" | "name" | "totalDonatedCents" | "donationCount" | "lastDonationAt" | "firstDonationAt";
  dir: "asc" | "desc";
}

export interface DonorListRow {
  donor: Prisma.DonorGetPayload<{}>;
  aggregates: DonorAggregates;
  status: DonorDisplayStatus;
  primaryInstrument: Prisma.FinixPaymentInstrumentSnapshotGetPayload<{}> | null;
  activeSubscriptionCount: number;
  givingLinkIds: string[];
}

export async function loadDonorsList(
  churchId: string,
  filters: DonorsListFilters,
  sort: DonorsListSort,
  page: number,
  pageSize: number,
) {
  const archivedStatus = filters.archivedStatus ?? "active";

  const where: Prisma.DonorWhereInput = {
    churchId,
    ...(archivedStatus === "active" ? { archivedAt: null } : {}),
    ...(archivedStatus === "archived" ? { archivedAt: { not: null } } : {}),
    ...(filters.createdDateFilter ? { createdAt: filters.createdDateFilter } : {}),
  };

  if (filters.search) {
    const q = filters.search.trim();
    const normalizedEmailQuery = normalizeEmail(q);
    const normalizedPhoneQuery = normalizePhone(q);
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { phone: { contains: q } },
      { id: q },
      { finixIdentityId: q },
      ...(normalizedEmailQuery ? [{ normalizedEmail: normalizedEmailQuery }] : []),
      ...(normalizedPhoneQuery ? [{ normalizedPhone: normalizedPhoneQuery }] : []),
    ];
  }

  const candidates = await prisma.donor.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: DONOR_CANDIDATE_CAP,
  });

  const donorIds = candidates.map((d) => d.id);
  const [aggregatesMap, riskSignalsMap, instruments] = await Promise.all([
    loadDonorAggregatesBatch(donorIds, churchId),
    loadDonorRiskSignals(donorIds, churchId),
    donorIds.length
      ? prisma.finixPaymentInstrumentSnapshot.findMany({
          where: { churchId, donorId: { in: donorIds } },
          orderBy: { updatedAtFinix: "desc" },
        })
      : Promise.resolve([]),
  ]);

  const instrumentsByDonor = new Map<string, typeof instruments>();
  for (const i of instruments) {
    if (!i.donorId) continue;
    const list = instrumentsByDonor.get(i.donorId) ?? [];
    list.push(i);
    instrumentsByDonor.set(i.donorId, list);
  }

  // Giving-link attribution is resolved via FinixTransfer -> instrument ->
  // donor -> Payment.givingLinkId (Payment.donorId itself is unreliable —
  // see donorAggregates.ts for why), only needed here for the givingLinkId
  // filter (donorAggregates already computes the count the same way).
  const instrumentToDonor = new Map(instruments.map((i) => [i.finixPaymentInstrumentId, i.donorId!]));
  const instrumentIds = [...instrumentToDonor.keys()];
  const givingLinksByDonor = new Map<string, Set<string>>();
  if (instrumentIds.length > 0) {
    const transfers = await prisma.finixTransfer.findMany({
      where: { churchId, finixPaymentInstrumentId: { in: instrumentIds } },
      select: { finixTransferId: true, finixPaymentInstrumentId: true },
    });
    const transferIdToDonor = new Map<string, string>();
    for (const t of transfers) {
      const donorId = t.finixPaymentInstrumentId ? instrumentToDonor.get(t.finixPaymentInstrumentId) : undefined;
      if (donorId) transferIdToDonor.set(t.finixTransferId, donorId);
    }
    const transferIds = [...transferIdToDonor.keys()];
    const givingLinkPayments = transferIds.length
      ? await prisma.payment.findMany({
          where: { churchId, finixTransferId: { in: transferIds }, givingLinkId: { not: null } },
          select: { finixTransferId: true, givingLinkId: true },
        })
      : [];
    for (const p of givingLinkPayments) {
      const donorId = p.finixTransferId ? transferIdToDonor.get(p.finixTransferId) : undefined;
      if (!donorId || !p.givingLinkId) continue;
      const set = givingLinksByDonor.get(donorId) ?? new Set();
      set.add(p.givingLinkId);
      givingLinksByDonor.set(donorId, set);
    }
  }

  let rows: DonorListRow[] = candidates.map((donor) => {
    const aggregates = aggregatesMap.get(donor.id)!;
    const riskInput = riskSignalsMap.get(donor.id)!;
    return {
      donor,
      aggregates,
      status: resolveDonorDisplayStatus(riskInput),
      primaryInstrument: instrumentsByDonor.get(donor.id)?.[0] ?? null,
      activeSubscriptionCount: aggregates.activeSubscriptionCount,
      givingLinkIds: [...(givingLinksByDonor.get(donor.id) ?? [])],
    };
  });

  rows = rows.filter((r) => {
    if (filters.donorStatus && r.status !== filters.donorStatus) return false;
    if (filters.recurringOnly && r.activeSubscriptionCount === 0) return false;
    if (filters.paymentMethod === "card" && !r.primaryInstrument?.cardLast4) return false;
    if (filters.paymentMethod === "bank" && !r.primaryInstrument?.bankLast4) return false;
    if (filters.minTotalDonatedCents != null && r.aggregates.totalDonatedCents < filters.minTotalDonatedCents) return false;
    if (filters.maxTotalDonatedCents != null && r.aggregates.totalDonatedCents > filters.maxTotalDonatedCents) return false;
    if (filters.minDonationCount != null && r.aggregates.donationCount < filters.minDonationCount) return false;
    if (filters.maxDonationCount != null && r.aggregates.donationCount > filters.maxDonationCount) return false;
    if (filters.givingLinkId && !r.givingLinkIds.includes(filters.givingLinkId)) return false;
    if (filters.hasFailedPayment && r.aggregates.failedPaymentCount === 0) return false;
    if (filters.hasRefund && r.aggregates.refundCount === 0) return false;
    if (filters.hasBankReturn && r.aggregates.bankReturnCount === 0) return false;
    if (filters.hasDispute && r.aggregates.disputeCount === 0) return false;
    if (filters.hasActiveSubscription && r.activeSubscriptionCount === 0) return false;
    if (filters.firstDonationDateFilter) {
      const d = r.aggregates.firstDonationAt;
      if (!d) return false;
      if (d < filters.firstDonationDateFilter.gte) return false;
      if (filters.firstDonationDateFilter.lte && d > filters.firstDonationDateFilter.lte) return false;
    }
    if (filters.lastDonationDateFilter) {
      const d = r.aggregates.lastDonationAt;
      if (!d) return false;
      if (d < filters.lastDonationDateFilter.gte) return false;
      if (filters.lastDonationDateFilter.lte && d > filters.lastDonationDateFilter.lte) return false;
    }
    return true;
  });

  rows.sort((a, b) => {
    let av: number, bv: number;
    switch (sort.key) {
      case "name":
        return sort.dir === "asc"
          ? (a.donor.name || "").localeCompare(b.donor.name || "")
          : (b.donor.name || "").localeCompare(a.donor.name || "");
      case "totalDonatedCents":
        av = a.aggregates.totalDonatedCents;
        bv = b.aggregates.totalDonatedCents;
        break;
      case "donationCount":
        av = a.aggregates.donationCount;
        bv = b.aggregates.donationCount;
        break;
      case "lastDonationAt":
        av = a.aggregates.lastDonationAt?.getTime() ?? 0;
        bv = b.aggregates.lastDonationAt?.getTime() ?? 0;
        break;
      case "firstDonationAt":
        av = a.aggregates.firstDonationAt?.getTime() ?? 0;
        bv = b.aggregates.firstDonationAt?.getTime() ?? 0;
        break;
      default:
        av = a.donor.createdAt.getTime();
        bv = b.donor.createdAt.getTime();
    }
    return sort.dir === "asc" ? av - bv : bv - av;
  });

  const totalCount = rows.length;
  const paged = rows.slice((page - 1) * pageSize, page * pageSize);

  return { rows: paged, totalCount, page, pageSize, candidateCapReached: candidates.length === DONOR_CANDIDATE_CAP };
}
