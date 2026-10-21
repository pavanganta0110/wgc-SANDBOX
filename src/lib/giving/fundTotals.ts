/**
 * Per-fund giving totals for the merchant Funds page: online gifts
 * (successful Payments) and recorded offline gifts (ExternalDonation), grouped
 * by fund. Summed in Postgres (groupBy), never by loading every payment.
 *
 * Online amounts use Payment.amountCents (what the donor was charged, before
 * refunds), matching the Reporting page's "Giving by fund" chart.
 */
import { prisma } from "@/lib/prisma";
import { externalDonationEligibilityWhere, isExternalDonationDeposited, type DateRangeFilter } from "@/lib/donors/donorAggregates";

export interface FundTotalsRow {
  /** Null for gifts with no fund (the "No fund" row). */
  fundId: string | null;
  name: string;
  description: string | null;
  isActive: boolean;
  /** False for a fund name found on gifts but no longer in the catalog. */
  inCatalog: boolean;
  onlineCents: number;
  onlineCount: number;
  offlineCents: number;
  offlineCount: number;
  totalCents: number;
  lastGiftAt: Date | null;
}

export async function loadFundTotals(params: {
  churchId: string;
  range?: DateRangeFilter;
  /** Scoped viewer (e.g. a fundraiser): only these donors' gifts count. */
  donorIds?: string[];
}): Promise<FundTotalsRow[]> {
  const { churchId, range, donorIds } = params;
  const [catalog, online, offline] = await Promise.all([
    prisma.fund.findMany({
      where: { churchId },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, description: true, isActive: true },
    }),
    prisma.payment.groupBy({
      by: ["fundId", "fundName"],
      where: {
        churchId,
        status: "SUCCEEDED",
        ...(range ? { createdAt: range } : {}),
        ...(donorIds ? { donorId: { in: donorIds } } : {}),
      },
      _sum: { amountCents: true },
      _count: true,
      _max: { createdAt: true },
    }),
    prisma.externalDonation.groupBy({
      by: ["fundId", "fundName", "depositStatus"],
      where: externalDonationEligibilityWhere(churchId, { donorIds, dateFilter: range }),
      _sum: { donationAmountCents: true },
      _count: true,
      _max: { donationDate: true },
    }),
  ]);

  const rows = new Map<string, FundTotalsRow>();
  for (const f of catalog) {
    rows.set(f.id, {
      fundId: f.id,
      name: f.name,
      description: f.description,
      isActive: f.isActive,
      inCatalog: true,
      onlineCents: 0,
      onlineCount: 0,
      offlineCents: 0,
      offlineCount: 0,
      totalCents: 0,
      lastGiftAt: null,
    });
  }
  // Gifts whose fund isn't in the catalog any more are keyed by their
  // snapshotted name; gifts with no fund at all share the "No fund" row.
  const rowFor = (fundId: string | null, fundName: string | null): FundTotalsRow => {
    const key = fundId && rows.has(fundId) ? fundId : fundId || fundName ? `name:${fundName ?? fundId}` : "none";
    let row = rows.get(key);
    if (!row) {
      row = {
        fundId: key === "none" ? null : fundId,
        name: key === "none" ? "No fund" : fundName || "Unnamed fund",
        description: null,
        isActive: false,
        inCatalog: false,
        onlineCents: 0,
        onlineCount: 0,
        offlineCents: 0,
        offlineCount: 0,
        totalCents: 0,
        lastGiftAt: null,
      };
      rows.set(key, row);
    }
    return row;
  };
  const later = (a: Date | null, b: Date | null) => (!a ? b : !b ? a : a > b ? a : b);

  for (const g of online) {
    const row = rowFor(g.fundId, g.fundName);
    row.onlineCents += g._sum.amountCents ?? 0;
    row.onlineCount += g._count;
    row.lastGiftAt = later(row.lastGiftAt, g._max.createdAt);
  }
  for (const g of offline) {
    if (!isExternalDonationDeposited({ depositStatus: g.depositStatus })) continue;
    const row = rowFor(g.fundId, g.fundName);
    row.offlineCents += g._sum.donationAmountCents ?? 0;
    row.offlineCount += g._count;
    row.lastGiftAt = later(row.lastGiftAt, g._max.donationDate);
  }

  return [...rows.values()]
    .map((r) => ({ ...r, totalCents: r.onlineCents + r.offlineCents }))
    .sort((a, b) => {
      // Catalog funds first (active, then archived), then off-catalog names, then "No fund".
      const rank = (r: FundTotalsRow) => (r.fundId === null && !r.inCatalog && r.name === "No fund" ? 3 : !r.inCatalog ? 2 : r.isActive ? 0 : 1);
      return rank(a) - rank(b) || b.totalCents - a.totalCents;
    });
}
