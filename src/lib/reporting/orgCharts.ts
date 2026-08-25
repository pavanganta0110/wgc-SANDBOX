/**
 * Org-wide chart data for the Reporting dashboard (item 19). Uses Prisma
 * groupBy (database aggregation) rather than looping per donor — the
 * per-donor breakdown functions in donorBreakdowns.ts are for a single
 * donor's own profile page and are not reused here for that reason (they'd
 * be an N+1 query per donor at dashboard scale).
 */
import { prisma } from "@/lib/prisma";
import type { DateRangeFilter } from "@/lib/donors/donorAggregates";

export interface FundGivingRow {
  fundId: string | null;
  fundName: string;
  amountCents: number;
  count: number;
}

export async function loadGivingByFund(churchId: string, dateFilter?: DateRangeFilter, donorIds?: string[]): Promise<FundGivingRow[]> {
  const grouped = await prisma.payment.groupBy({
    by: ["fundId", "fundName"],
    where: {
      churchId,
      status: "SUCCEEDED",
      fundId: { not: null },
      ...(dateFilter ? { createdAt: dateFilter } : {}),
      ...(donorIds ? { donorId: { in: donorIds } } : {}),
    },
    _sum: { amountCents: true },
    _count: true,
  });
  return grouped
    .map((g) => ({ fundId: g.fundId, fundName: g.fundName || "Unnamed Fund", amountCents: g._sum.amountCents ?? 0, count: g._count }))
    .sort((a, b) => b.amountCents - a.amountCents);
}

export interface PaymentMethodMixRow {
  method: "CARD" | "ACH" | "EXTERNAL";
  amountCents: number;
  count: number;
}

export async function loadOrgPaymentMethodMix(churchId: string, dateFilter?: DateRangeFilter, donorIds?: string[]): Promise<PaymentMethodMixRow[]> {
  const [payments, external] = await Promise.all([
    prisma.payment.groupBy({
      by: ["paymentMethodType"],
      where: { churchId, status: "SUCCEEDED", ...(dateFilter ? { createdAt: dateFilter } : {}), ...(donorIds ? { donorId: { in: donorIds } } : {}) },
      _sum: { amountCents: true },
      _count: true,
    }),
    prisma.externalDonation.aggregate({
      where: { churchId, status: { not: "VOIDED" }, ...(dateFilter ? { donationDate: dateFilter } : {}), ...(donorIds ? { donorId: { in: donorIds } } : {}) },
      _sum: { donationAmountCents: true },
      _count: true,
    }),
  ]);

  let cardCents = 0;
  let cardCount = 0;
  let achCents = 0;
  let achCount = 0;
  for (const p of payments) {
    if (p.paymentMethodType === "BANK_ACCOUNT") {
      achCents += p._sum.amountCents ?? 0;
      achCount += p._count;
    } else {
      cardCents += p._sum.amountCents ?? 0;
      cardCount += p._count;
    }
  }

  return [
    { method: "CARD", amountCents: cardCents, count: cardCount },
    { method: "ACH", amountCents: achCents, count: achCount },
    { method: "EXTERNAL", amountCents: external._sum.donationAmountCents ?? 0, count: external._count },
  ];
}

// item 19's suggested buckets, kept configurable-in-code rather than
// hardcoded UI strings scattered elsewhere.
export const DONOR_DISTRIBUTION_BUCKETS = [
  { label: "<$100", minCents: 0, maxCents: 9999 },
  { label: "$100–$499", minCents: 10000, maxCents: 49999 },
  { label: "$500–$999", minCents: 50000, maxCents: 99999 },
  { label: "$1,000–$4,999", minCents: 100000, maxCents: 499999 },
  { label: "$5,000+", minCents: 500000, maxCents: Infinity },
];

export interface DonorDistributionRow {
  label: string;
  donorCount: number;
}

/** Buckets donors by their lifetime giving total (already computed once per donor, no N+1). */
export function bucketDonorsByLifetimeGiving(lifetimeGivingCentsByDonor: number[]): DonorDistributionRow[] {
  return DONOR_DISTRIBUTION_BUCKETS.map((b) => ({
    label: b.label,
    donorCount: lifetimeGivingCentsByDonor.filter((c) => c >= b.minCents && c <= b.maxCents).length,
  }));
}
