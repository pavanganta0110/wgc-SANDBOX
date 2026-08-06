import { prisma } from "@/lib/prisma";
import type { DonorAggregates } from "@/lib/donors/donorAggregates";
import { EXTERNAL_PAYMENT_METHOD_LABELS, type ExternalPaymentMethod } from "@/lib/donations/externalDonationTypes";

/** Badge labels shown on the donor list/profile for "how has this donor
 * given" — a donor who has used multiple methods gets multiple badges,
 * never a single "External" label that hides their WGC-processed history
 * (or vice versa). */
export type DonorSourceBadge =
  | "WGC Payment"
  | "Invoice"
  | "Recurring"
  | "Imported"
  | ExternalPaymentMethod;

export const DONOR_SOURCE_BADGE_LABELS: Record<string, string> = {
  "WGC Payment": "WGC Payment",
  Invoice: "Invoice",
  Recurring: "Recurring",
  Imported: "Imported",
  ...EXTERNAL_PAYMENT_METHOD_LABELS,
};

/**
 * Computes the set of "how has this donor given" badges for a batch of
 * donors, from data already fetched (aggregates) plus one additional query
 * for which external payment methods were actually used (Cash vs Check vs
 * Zelle etc., not just "External Donation" as a single opaque label).
 *
 * "WGC Payment" is derived from aggregates rather than re-querying
 * FinixTransfer directly: totalDonatedCents/donationCount already include
 * the external-donation portion (donorAggregates.ts), so the WGC-processed
 * portion is the aggregate total minus the external portion.
 */
export async function loadDonorSourceBadges(
  donorIds: string[],
  churchId: string,
  aggregatesByDonor: Map<string, DonorAggregates>,
): Promise<Map<string, DonorSourceBadge[]>> {
  const result = new Map<string, DonorSourceBadge[]>();
  if (donorIds.length === 0) return result;

  const externalRows = donorIds.length
    ? await prisma.externalDonation.findMany({
        where: { churchId, donorId: { in: donorIds }, status: { not: "VOIDED" } },
        select: { donorId: true, paymentMethod: true, importBatchId: true },
      })
    : [];

  for (const donorId of donorIds) {
    const badges = new Set<DonorSourceBadge>();
    const agg = aggregatesByDonor.get(donorId);
    if (agg) {
      const processedCount = agg.donationCount - agg.externalDonationCount;
      if (processedCount > 0) badges.add("WGC Payment");
      if (agg.activeSubscriptionCount > 0) badges.add("Recurring");
    }
    result.set(donorId, [...badges]);
  }

  for (const row of externalRows) {
    if (!row.donorId) continue;
    const badges = result.get(row.donorId) ?? [];
    const method = row.paymentMethod as ExternalPaymentMethod;
    if (EXTERNAL_PAYMENT_METHOD_LABELS[method] && !badges.includes(method)) badges.push(method);
    if (row.importBatchId && !badges.includes("Imported")) badges.push("Imported");
    result.set(row.donorId, badges);
  }

  return result;
}
