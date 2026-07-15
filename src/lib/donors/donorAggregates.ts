import { prisma } from "@/lib/prisma";

export interface DonorAggregates {
  totalDonatedCents: number;
  donationCount: number;
  averageDonationCents: number;
  largestDonationCents: number;
  firstDonationAt: Date | null;
  lastDonationAt: Date | null;
  refundedAmountCents: number;
  returnedAmountCents: number;
  disputedAmountCents: number;
  netDonatedCents: number;
  activeSubscriptionCount: number;
  failedPaymentCount: number;
  refundCount: number;
  bankReturnCount: number;
  disputeCount: number;
  givingLinkCount: number;
}

export const EMPTY_DONOR_AGGREGATES: DonorAggregates = {
  totalDonatedCents: 0,
  donationCount: 0,
  averageDonationCents: 0,
  largestDonationCents: 0,
  firstDonationAt: null,
  lastDonationAt: null,
  refundedAmountCents: 0,
  returnedAmountCents: 0,
  disputedAmountCents: 0,
  netDonatedCents: 0,
  activeSubscriptionCount: 0,
  failedPaymentCount: 0,
  refundCount: 0,
  bankReturnCount: 0,
  disputeCount: 0,
  givingLinkCount: 0,
};

export interface DateRangeFilter {
  gte: Date;
  lte?: Date;
}

/**
 * The single centralized aggregate calculation for donor financial history —
 * every surface (list, drawer, profile, export, analytics) must call this
 * rather than re-deriving totals independently, so the numbers can never
 * drift between pages.
 *
 * Base donation record is FinixTransfer, not Payment — confirmed against
 * real data that Payment (WGC's own hosted-checkout table) is nearly empty
 * for this organization while FinixTransfer (synced directly from the
 * processor) holds the real donation history; the original donors page
 * already worked this way. Payment is still consulted, via
 * FinixTransfer.paymentId, purely to attribute a givingLinkId when one
 * exists — a Finix-native transfer with no matching Payment row simply has
 * no giving-link attribution, which is reported honestly as zero rather
 * than guessed at.
 *
 * "Successful donation" = FinixTransfer.state === "SUCCEEDED", donor
 * resolved via finixPaymentInstrumentId -> FinixPaymentInstrumentSnapshot.donorId
 * (the same join the existing Recurring Donors / original Donors pages use).
 * A transfer later reversed by an ACH return is NOT excluded from the gross
 * count — Finix does not flip FinixTransfer.state when a return happens —
 * its returned amount is tracked separately via BankReturn and subtracted
 * only from netDonatedCents, never from the gross donation count.
 *
 * netDonatedCents = gross successful donations − successful refunds −
 * confirmed bank returns. Disputed amounts are reported separately as
 * "exposure," never subtracted from net, unless a dispute loss produced a
 * real reversal transfer — which, when it happens, already shows up in
 * refundedAmountCents on its own, so there's no separate dispute-loss term
 * to add without double-counting.
 */
export async function loadDonorAggregatesBatch(
  donorIds: string[],
  churchId: string,
  dateFilter?: DateRangeFilter,
): Promise<Map<string, DonorAggregates>> {
  const result = new Map<string, DonorAggregates>(donorIds.map((id) => [id, { ...EMPTY_DONOR_AGGREGATES }]));
  if (donorIds.length === 0) return result;

  const instruments = await prisma.finixPaymentInstrumentSnapshot.findMany({
    where: { churchId, donorId: { in: donorIds } },
    select: { finixPaymentInstrumentId: true, donorId: true },
  });
  const instrumentToDonor = new Map(instruments.map((i) => [i.finixPaymentInstrumentId, i.donorId!]));
  const instrumentIds = [...instrumentToDonor.keys()];

  if (instrumentIds.length === 0) {
    const activeSubs = await loadActiveSubscriptionCounts(donorIds, churchId);
    for (const donorId of donorIds) {
      result.set(donorId, { ...EMPTY_DONOR_AGGREGATES, activeSubscriptionCount: activeSubs.get(donorId) ?? 0 });
    }
    return result;
  }

  const transfers = await prisma.finixTransfer.findMany({
    where: {
      churchId,
      finixPaymentInstrumentId: { in: instrumentIds },
      ...(dateFilter ? { createdAtFinix: dateFilter } : {}),
    },
    select: {
      finixTransferId: true,
      finixPaymentInstrumentId: true,
      paymentId: true,
      amountCents: true,
      state: true,
      createdAtFinix: true,
    },
  });

  const successfulByDonor = new Map<string, typeof transfers>();
  const failedCountByDonor = new Map<string, number>();
  const transferIdToDonor = new Map<string, string>();

  for (const t of transfers) {
    const donorId = t.finixPaymentInstrumentId ? instrumentToDonor.get(t.finixPaymentInstrumentId) : undefined;
    if (!donorId) continue;
    transferIdToDonor.set(t.finixTransferId, donorId);

    const state = (t.state || "").toUpperCase();
    if (state === "SUCCEEDED") {
      const list = successfulByDonor.get(donorId) ?? [];
      list.push(t);
      successfulByDonor.set(donorId, list);
    } else if (state === "FAILED") {
      failedCountByDonor.set(donorId, (failedCountByDonor.get(donorId) ?? 0) + 1);
    }
  }

  const transferIds = [...transferIdToDonor.keys()];
  const paymentIds = transfers.map((t) => t.paymentId).filter((id): id is string => Boolean(id));

  const [refunds, bankReturns, disputes, activeSubs, givingLinkPayments] = await Promise.all([
    transferIds.length
      ? prisma.finixRefundOrReversal.findMany({
          where: { churchId, finixOriginalTransferId: { in: transferIds }, state: "SUCCEEDED" },
          select: { finixOriginalTransferId: true, amountCents: true },
        })
      : Promise.resolve([]),
    transferIds.length
      ? prisma.bankReturn.findMany({
          where: { churchId, originalTransferId: { in: transferIds } },
          select: { originalTransferId: true, amountCents: true },
        })
      : Promise.resolve([]),
    transferIds.length
      ? prisma.finixDispute.findMany({
          where: { churchId, finixTransferId: { in: transferIds } },
          select: { finixTransferId: true, amountCents: true },
        })
      : Promise.resolve([]),
    loadActiveSubscriptionCounts(donorIds, churchId),
    transferIds.length
      ? prisma.payment.findMany({
          where: {
            churchId,
            OR: [{ id: { in: paymentIds } }, { finixTransferId: { in: transferIds } }],
            givingLinkId: { not: null },
          },
          select: { finixTransferId: true, givingLinkId: true },
        })
      : Promise.resolve([]),
  ]);

  const refundedByDonor = new Map<string, { amount: number; count: number }>();
  for (const r of refunds) {
    const donorId = r.finixOriginalTransferId ? transferIdToDonor.get(r.finixOriginalTransferId) : undefined;
    if (!donorId) continue;
    const acc = refundedByDonor.get(donorId) ?? { amount: 0, count: 0 };
    acc.amount += r.amountCents ?? 0;
    acc.count += 1;
    refundedByDonor.set(donorId, acc);
  }

  const returnedByDonor = new Map<string, { amount: number; count: number }>();
  for (const r of bankReturns) {
    const donorId = r.originalTransferId ? transferIdToDonor.get(r.originalTransferId) : undefined;
    if (!donorId) continue;
    const acc = returnedByDonor.get(donorId) ?? { amount: 0, count: 0 };
    acc.amount += r.amountCents ?? 0;
    acc.count += 1;
    returnedByDonor.set(donorId, acc);
  }

  const disputedByDonor = new Map<string, { amount: number; count: number }>();
  for (const d of disputes) {
    const donorId = d.finixTransferId ? transferIdToDonor.get(d.finixTransferId) : undefined;
    if (!donorId) continue;
    const acc = disputedByDonor.get(donorId) ?? { amount: 0, count: 0 };
    acc.amount += d.amountCents ?? 0;
    acc.count += 1;
    disputedByDonor.set(donorId, acc);
  }

  const givingLinkCountByDonor = new Map<string, Set<string>>();
  for (const p of givingLinkPayments) {
    const donorId = p.finixTransferId ? transferIdToDonor.get(p.finixTransferId) : undefined;
    if (!donorId || !p.givingLinkId) continue;
    const set = givingLinkCountByDonor.get(donorId) ?? new Set();
    set.add(p.givingLinkId);
    givingLinkCountByDonor.set(donorId, set);
  }

  for (const donorId of donorIds) {
    const successful = successfulByDonor.get(donorId) ?? [];
    const totalDonatedCents = successful.reduce((sum, t) => sum + (t.amountCents ?? 0), 0);
    const donationCount = successful.length;
    const largestDonationCents = successful.reduce((max, t) => Math.max(max, t.amountCents ?? 0), 0);
    const dates = successful.map((t) => t.createdAtFinix?.getTime()).filter((d): d is number => d != null);
    const refunded = refundedByDonor.get(donorId) ?? { amount: 0, count: 0 };
    const returned = returnedByDonor.get(donorId) ?? { amount: 0, count: 0 };
    const disputed = disputedByDonor.get(donorId) ?? { amount: 0, count: 0 };

    result.set(donorId, {
      totalDonatedCents,
      donationCount,
      averageDonationCents: donationCount > 0 ? Math.round(totalDonatedCents / donationCount) : 0,
      largestDonationCents,
      firstDonationAt: dates.length ? new Date(Math.min(...dates)) : null,
      lastDonationAt: dates.length ? new Date(Math.max(...dates)) : null,
      refundedAmountCents: refunded.amount,
      returnedAmountCents: returned.amount,
      disputedAmountCents: disputed.amount,
      netDonatedCents: totalDonatedCents - refunded.amount - returned.amount,
      activeSubscriptionCount: activeSubs.get(donorId) ?? 0,
      failedPaymentCount: failedCountByDonor.get(donorId) ?? 0,
      refundCount: refunded.count,
      bankReturnCount: returned.count,
      disputeCount: disputed.count,
      givingLinkCount: givingLinkCountByDonor.get(donorId)?.size ?? 0,
    });
  }

  return result;
}

export async function loadDonorAggregates(
  donorId: string,
  churchId: string,
  dateFilter?: DateRangeFilter,
): Promise<DonorAggregates> {
  const map = await loadDonorAggregatesBatch([donorId], churchId, dateFilter);
  return map.get(donorId) ?? { ...EMPTY_DONOR_AGGREGATES };
}

/**
 * Recurring donations (FinixSubscription) carry no donorId directly — donor
 * is resolved through finixPaymentInstrumentId -> FinixPaymentInstrumentSnapshot.donorId,
 * the same join the existing Recurring Donors page uses. ChurchSubscription
 * is a distinct, unrelated model (WGC's own SaaS billing of the organization,
 * not a donor recurring gift) and is intentionally not used here.
 */
async function loadActiveSubscriptionCounts(donorIds: string[], churchId: string): Promise<Map<string, number>> {
  const instruments = await prisma.finixPaymentInstrumentSnapshot.findMany({
    where: { churchId, donorId: { in: donorIds } },
    select: { finixPaymentInstrumentId: true, donorId: true },
  });
  const instrumentToDonor = new Map(instruments.map((i) => [i.finixPaymentInstrumentId, i.donorId!]));
  const instrumentIds = [...instrumentToDonor.keys()];
  if (instrumentIds.length === 0) return new Map();

  const subs = await prisma.finixSubscription.findMany({
    where: { churchId, finixPaymentInstrumentId: { in: instrumentIds }, state: "ACTIVE" },
    select: { finixPaymentInstrumentId: true },
  });

  const counts = new Map<string, number>();
  for (const s of subs) {
    const donorId = s.finixPaymentInstrumentId ? instrumentToDonor.get(s.finixPaymentInstrumentId) : undefined;
    if (!donorId) continue;
    counts.set(donorId, (counts.get(donorId) ?? 0) + 1);
  }
  return counts;
}
