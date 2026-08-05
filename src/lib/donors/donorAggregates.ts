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
  /** Portion of totalDonatedCents/donationCount that came from ExternalDonation
   * rows (cash/check/Zelle/imported/etc.) rather than Finix/invoice processing —
   * "WGC-processed" = totalDonatedCents - externalDonatedCents. */
  externalDonatedCents: number;
  externalDonationCount: number;
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
  externalDonatedCents: 0,
  externalDonationCount: 0,
};

export interface DateRangeFilter {
  gte: Date;
  lte?: Date;
}

/**
 * Canonical eligibility rule for ExternalDonation rows, shared by every
 * caller (per-donor aggregates, org summary, Top Donors, Donation Trend) so
 * "what counts as a real external donation" is defined exactly once. Voided
 * rows never count. depositStatus is deliberately NOT filtered here at the
 * SQL level — depositStatus is only ever set on CHECK rows (see schema
 * comment on ExternalDonation.depositStatus); every other payment method
 * (cash, Zelle, Cash App, bank transfer, imported, etc.) has depositStatus
 * = null, and Postgres's `<> 'RETURNED'` evaluates to NULL (excluded, not
 * included) for a null column — filtering depositStatus in the WHERE
 * clause would silently drop every non-check external donation from every
 * total on the app. depositStatus === "RETURNED" exclusion is applied in
 * JS by each caller instead, where null correctly means "not returned."
 */
export function externalDonationEligibilityWhere(
  churchId: string,
  opts: {
    donorIds?: string[];
    dateFilter?: DateRangeFilter;
    attributedUserId?: string;
  } = {},
) {
  return {
    churchId,
    status: { not: "VOIDED" as const },
    ...(opts.donorIds ? { donorId: { in: opts.donorIds } } : {}),
    ...(opts.attributedUserId
      ? { createdByUserId: opts.attributedUserId }
      : {}),
    ...(opts.dateFilter ? { donationDate: opts.dateFilter } : {}),
  };
}

/** JS-side depositStatus filter — see externalDonationEligibilityWhere's
 * doc comment for why this can never be pushed into the SQL WHERE clause. */
export function isExternalDonationDeposited(row: { depositStatus?: string | null }): boolean {
  return row.depositStatus !== "RETURNED";
}

/**
 * Canonical eligibility rule for FinixTransfer rows: SUCCEEDED only. A
 * later ACH return does not flip this state (see module doc comment above)
 * — returns are tracked separately and only ever netted out of
 * netDonatedCents, never excluded from the gross successful count.
 */
export function finixTransferEligibilityWhere(
  churchId: string,
  instrumentIds: string[],
  dateFilter?: DateRangeFilter,
) {
  return {
    churchId,
    finixPaymentInstrumentId: { in: instrumentIds },
    state: "SUCCEEDED" as const,
    ...(dateFilter ? { createdAtFinix: dateFilter } : {}),
  };
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
interface InvoiceContribution {
  totalCents: number;
  count: number;
  largestCents: number;
  refundedCents: number;
  dates: number[];
}

/**
 * Folds each donor's linked charitable invoice payments (Invoice.linkedDonorId,
 * classification CHARITABLE_DONATION/PARTIAL_DONATION only — a
 * GOODS_OR_SERVICES invoice is a commercial transaction, never counted as
 * a donation) into the same totals this function already produces from
 * Finix transfers, so "Total Donated" never diverges between an invoice
 * payment and a giving-page donation. Mirrors the fee-inclusion and
 * refund handling in computeInvoicePaymentLines (yearEndStatements.ts) —
 * the same rules, not a second set invented here.
 *
 * Deliberately skipped when `attributedUserId` is set (a fundraiser-scoped
 * view): InvoicePayment has no attribution column to bridge through (unlike
 * Payment.attributedUserId), so there's no correct way to attribute an
 * invoice payment to a specific team member — omitting it here is safer
 * than guessing wrong and either over- or under-reporting a scoped user's
 * numbers.
 */
async function loadInvoiceContributionsByDonor(
  donorIds: string[],
  churchId: string,
  dateFilter?: DateRangeFilter,
  attributedUserId?: string,
): Promise<Map<string, InvoiceContribution>> {
  const byDonor = new Map<string, InvoiceContribution>();
  if (attributedUserId || donorIds.length === 0) return byDonor;

  const invoices = await prisma.invoice.findMany({
    where: {
      churchId,
      linkedDonorId: { in: donorIds },
      classification: { in: ["CHARITABLE_DONATION", "PARTIAL_DONATION"] },
    },
    select: {
      id: true,
      linkedDonorId: true,
      classification: true,
      totalCents: true,
      charitablePortionCents: true,
    },
  });
  if (invoices.length === 0) return byDonor;
  const invoiceById = new Map(invoices.map((i) => [i.id, i]));

  const payments = await prisma.invoicePayment.findMany({
    where: {
      churchId,
      invoiceId: { in: invoices.map((i) => i.id) },
      status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED"] },
      ...(dateFilter ? { createdAt: dateFilter } : {}),
    },
    select: {
      invoiceId: true,
      grossAmountCents: true,
      refundedCents: true,
      feeContributionCents: true,
      feeContributionRefundedCents: true,
      customerCoveredFee: true,
      createdAt: true,
    },
  });

  for (const p of payments) {
    const invoice = invoiceById.get(p.invoiceId);
    if (!invoice?.linkedDonorId) continue;
    const netPrincipalCents = Math.max(0, p.grossAmountCents - p.refundedCents);
    const netFeeCents = p.customerCoveredFee
      ? Math.max(0, p.feeContributionCents - p.feeContributionRefundedCents)
      : 0;
    const finalCents = netPrincipalCents + netFeeCents;
    if (finalCents <= 0) continue;

    const acc = byDonor.get(invoice.linkedDonorId) ?? {
      totalCents: 0,
      count: 0,
      largestCents: 0,
      refundedCents: 0,
      dates: [],
    };
    acc.totalCents += finalCents;
    acc.count += 1;
    acc.largestCents = Math.max(acc.largestCents, finalCents);
    acc.refundedCents += p.refundedCents;
    acc.dates.push(p.createdAt.getTime());
    byDonor.set(invoice.linkedDonorId, acc);
  }

  return byDonor;
}

function mergeInvoiceContribution(
  aggregates: DonorAggregates,
  contribution: InvoiceContribution | undefined,
): DonorAggregates {
  if (!contribution) return aggregates;
  const totalDonatedCents =
    aggregates.totalDonatedCents + contribution.totalCents;
  const donationCount = aggregates.donationCount + contribution.count;
  const allDates = [
    ...(aggregates.firstDonationAt
      ? [aggregates.firstDonationAt.getTime()]
      : []),
    ...(aggregates.lastDonationAt ? [aggregates.lastDonationAt.getTime()] : []),
    ...contribution.dates,
  ];
  return {
    ...aggregates,
    totalDonatedCents,
    donationCount,
    averageDonationCents:
      donationCount > 0 ? Math.round(totalDonatedCents / donationCount) : 0,
    largestDonationCents: Math.max(
      aggregates.largestDonationCents,
      contribution.largestCents,
    ),
    firstDonationAt: allDates.length ? new Date(Math.min(...allDates)) : null,
    lastDonationAt: allDates.length ? new Date(Math.max(...allDates)) : null,
    refundedAmountCents:
      aggregates.refundedAmountCents + contribution.refundedCents,
    netDonatedCents:
      aggregates.netDonatedCents +
      contribution.totalCents -
      contribution.refundedCents,
  };
}

/**
 * Folds each donor's active ExternalDonation rows (cash/check/Zelle/Cash App/
 * bank transfer/imported/etc.) into the same totals this function already
 * produces from Finix transfers and charitable invoice payments, so a
 * donor who has only ever given offline still shows a real "Total Donated"
 * and isn't invisible to every financial filter on the donor list.
 *
 * "Active" mirrors every other reader of this table: status !== "VOIDED"
 * and depositStatus !== "RETURNED" (a bounced check never counts as
 * received). There is no separate refund concept for external donations —
 * a returned/voided row is simply excluded, not netted against a refund
 * amount, since the organization received nothing to refund.
 *
 * Scoped (attributedUserId) views ARE supported here, unlike invoice
 * contributions — ExternalDonation.createdByUserId is a direct column, so
 * a fundraiser-scoped view can correctly filter to only the external
 * donations they personally recorded.
 */
async function loadExternalDonationContributionsByDonor(
  donorIds: string[],
  churchId: string,
  dateFilter?: DateRangeFilter,
  attributedUserId?: string,
): Promise<Map<string, InvoiceContribution>> {
  const byDonor = new Map<string, InvoiceContribution>();
  if (donorIds.length === 0) return byDonor;

  const rows = await prisma.externalDonation.findMany({
    where: externalDonationEligibilityWhere(churchId, {
      donorIds,
      dateFilter,
      attributedUserId,
    }),
    select: {
      donorId: true,
      donationAmountCents: true,
      donationDate: true,
      depositStatus: true,
    },
  });

  for (const r of rows) {
    if (!r.donorId || r.depositStatus === "RETURNED") continue;
    const acc = byDonor.get(r.donorId) ?? {
      totalCents: 0,
      count: 0,
      largestCents: 0,
      refundedCents: 0,
      dates: [],
    };
    acc.totalCents += r.donationAmountCents;
    acc.count += 1;
    acc.largestCents = Math.max(acc.largestCents, r.donationAmountCents);
    acc.dates.push(r.donationDate.getTime());
    byDonor.set(r.donorId, acc);
  }

  return byDonor;
}

function mergeExternalDonationContribution(
  aggregates: DonorAggregates,
  contribution: InvoiceContribution | undefined,
): DonorAggregates {
  if (!contribution) return aggregates;
  const merged = mergeInvoiceContribution(aggregates, contribution);
  return {
    ...merged,
    externalDonatedCents:
      aggregates.externalDonatedCents + contribution.totalCents,
    externalDonationCount:
      aggregates.externalDonationCount + contribution.count,
  };
}

export async function loadDonorAggregatesBatch(
  donorIds: string[],
  churchId: string,
  dateFilter?: DateRangeFilter,
  // Team-access Checkpoint 4B: undefined = organization scope (unchanged
  // behavior). A string value restricts every total below to only the
  // transfers/subscriptions attributed to that user — see the in-memory
  // transfer filter a few lines down for how this bridges through
  // Payment.attributedUserId (FinixTransfer itself carries no attribution).
  attributedUserId?: string,
): Promise<Map<string, DonorAggregates>> {
  const result = new Map<string, DonorAggregates>(
    donorIds.map((id) => [id, { ...EMPTY_DONOR_AGGREGATES }]),
  );
  if (donorIds.length === 0) return result;

  const instruments = await prisma.finixPaymentInstrumentSnapshot.findMany({
    where: { churchId, donorId: { in: donorIds } },
    select: { finixPaymentInstrumentId: true, donorId: true },
  });
  const instrumentToDonor = new Map(
    instruments.map((i) => [i.finixPaymentInstrumentId, i.donorId!]),
  );
  const instrumentIds = [...instrumentToDonor.keys()];

  // Resolved once, up front, so the in-memory transfer filter below is a
  // simple Set membership check rather than a second query per branch.
  const allowedTransferIds = attributedUserId
    ? new Set(
        (
          await prisma.payment.findMany({
            where: { churchId, attributedUserId },
            select: { finixTransferId: true },
          })
        )
          .map((p) => p.finixTransferId)
          .filter((id): id is string => Boolean(id)),
      )
    : null;

  if (instrumentIds.length === 0) {
    const [activeSubs, invoiceContributions, externalContributions] =
      await Promise.all([
        loadActiveSubscriptionCounts(donorIds, churchId, attributedUserId),
        loadInvoiceContributionsByDonor(
          donorIds,
          churchId,
          dateFilter,
          attributedUserId,
        ),
        loadExternalDonationContributionsByDonor(
          donorIds,
          churchId,
          dateFilter,
          attributedUserId,
        ),
      ]);
    for (const donorId of donorIds) {
      const base = {
        ...EMPTY_DONOR_AGGREGATES,
        activeSubscriptionCount: activeSubs.get(donorId) ?? 0,
      };
      const withInvoice = mergeInvoiceContribution(
        base,
        invoiceContributions.get(donorId),
      );
      result.set(
        donorId,
        mergeExternalDonationContribution(
          withInvoice,
          externalContributions.get(donorId),
        ),
      );
    }
    return result;
  }

  const allTransfers = await prisma.finixTransfer.findMany({
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
  // Team-access Checkpoint 4B: scoped-user filter applied in-memory rather
  // than threaded into the query above, so this stays a single, low-risk
  // addition on top of the existing (already complex) aggregation logic
  // rather than a rewrite of it.
  const transfers = allowedTransferIds
    ? allTransfers.filter((t) => allowedTransferIds.has(t.finixTransferId))
    : allTransfers;

  const successfulByDonor = new Map<string, typeof transfers>();
  const failedCountByDonor = new Map<string, number>();
  const transferIdToDonor = new Map<string, string>();

  for (const t of transfers) {
    const donorId = t.finixPaymentInstrumentId
      ? instrumentToDonor.get(t.finixPaymentInstrumentId)
      : undefined;
    if (!donorId) continue;
    transferIdToDonor.set(t.finixTransferId, donorId);

    const state = (t.state || "").toUpperCase();
    if (state === "SUCCEEDED") {
      const list = successfulByDonor.get(donorId) ?? [];
      list.push(t);
      successfulByDonor.set(donorId, list);
    } else if (state === "FAILED") {
      failedCountByDonor.set(
        donorId,
        (failedCountByDonor.get(donorId) ?? 0) + 1,
      );
    }
  }

  const transferIds = [...transferIdToDonor.keys()];
  const paymentIds = transfers
    .map((t) => t.paymentId)
    .filter((id): id is string => Boolean(id));

  const [
    refunds,
    bankReturns,
    disputes,
    activeSubs,
    givingLinkPayments,
    invoiceContributions,
    externalContributions,
  ] = await Promise.all([
    transferIds.length
      ? prisma.finixRefundOrReversal.findMany({
          where: {
            churchId,
            finixOriginalTransferId: { in: transferIds },
            state: "SUCCEEDED",
          },
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
    loadActiveSubscriptionCounts(donorIds, churchId, attributedUserId),
    transferIds.length
      ? prisma.payment.findMany({
          where: {
            churchId,
            OR: [
              { id: { in: paymentIds } },
              { finixTransferId: { in: transferIds } },
            ],
            givingLinkId: { not: null },
          },
          select: { finixTransferId: true, givingLinkId: true },
        })
      : Promise.resolve([]),
    loadInvoiceContributionsByDonor(
      donorIds,
      churchId,
      dateFilter,
      attributedUserId,
    ),
    loadExternalDonationContributionsByDonor(
      donorIds,
      churchId,
      dateFilter,
      attributedUserId,
    ),
  ]);

  const refundedByDonor = new Map<string, { amount: number; count: number }>();
  for (const r of refunds) {
    const donorId = r.finixOriginalTransferId
      ? transferIdToDonor.get(r.finixOriginalTransferId)
      : undefined;
    if (!donorId) continue;
    const acc = refundedByDonor.get(donorId) ?? { amount: 0, count: 0 };
    acc.amount += r.amountCents ?? 0;
    acc.count += 1;
    refundedByDonor.set(donorId, acc);
  }

  const returnedByDonor = new Map<string, { amount: number; count: number }>();
  for (const r of bankReturns) {
    const donorId = r.originalTransferId
      ? transferIdToDonor.get(r.originalTransferId)
      : undefined;
    if (!donorId) continue;
    const acc = returnedByDonor.get(donorId) ?? { amount: 0, count: 0 };
    acc.amount += r.amountCents ?? 0;
    acc.count += 1;
    returnedByDonor.set(donorId, acc);
  }

  const disputedByDonor = new Map<string, { amount: number; count: number }>();
  for (const d of disputes) {
    const donorId = d.finixTransferId
      ? transferIdToDonor.get(d.finixTransferId)
      : undefined;
    if (!donorId) continue;
    const acc = disputedByDonor.get(donorId) ?? { amount: 0, count: 0 };
    acc.amount += d.amountCents ?? 0;
    acc.count += 1;
    disputedByDonor.set(donorId, acc);
  }

  const givingLinkCountByDonor = new Map<string, Set<string>>();
  for (const p of givingLinkPayments) {
    const donorId = p.finixTransferId
      ? transferIdToDonor.get(p.finixTransferId)
      : undefined;
    if (!donorId || !p.givingLinkId) continue;
    const set = givingLinkCountByDonor.get(donorId) ?? new Set();
    set.add(p.givingLinkId);
    givingLinkCountByDonor.set(donorId, set);
  }

  for (const donorId of donorIds) {
    const successful = successfulByDonor.get(donorId) ?? [];
    const totalDonatedCents = successful.reduce(
      (sum, t) => sum + (t.amountCents ?? 0),
      0,
    );
    const donationCount = successful.length;
    const largestDonationCents = successful.reduce(
      (max, t) => Math.max(max, t.amountCents ?? 0),
      0,
    );
    const dates = successful
      .map((t) => t.createdAtFinix?.getTime())
      .filter((d): d is number => d != null);
    const refunded = refundedByDonor.get(donorId) ?? { amount: 0, count: 0 };
    const returned = returnedByDonor.get(donorId) ?? { amount: 0, count: 0 };
    const disputed = disputedByDonor.get(donorId) ?? { amount: 0, count: 0 };

    const base: DonorAggregates = {
      totalDonatedCents,
      donationCount,
      averageDonationCents:
        donationCount > 0 ? Math.round(totalDonatedCents / donationCount) : 0,
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
      externalDonatedCents: 0,
      externalDonationCount: 0,
    };
    const withInvoice = mergeInvoiceContribution(
      base,
      invoiceContributions.get(donorId),
    );
    result.set(
      donorId,
      mergeExternalDonationContribution(
        withInvoice,
        externalContributions.get(donorId),
      ),
    );
  }

  return result;
}

export async function loadDonorAggregates(
  donorId: string,
  churchId: string,
  dateFilter?: DateRangeFilter,
  attributedUserId?: string,
): Promise<DonorAggregates> {
  const map = await loadDonorAggregatesBatch(
    [donorId],
    churchId,
    dateFilter,
    attributedUserId,
  );
  return map.get(donorId) ?? { ...EMPTY_DONOR_AGGREGATES };
}

/**
 * Recurring donations (FinixSubscription) carry no donorId directly — donor
 * is resolved through finixPaymentInstrumentId -> FinixPaymentInstrumentSnapshot.donorId,
 * the same join the existing Recurring Donors page uses. ChurchSubscription
 * is a distinct, unrelated model (WGC's own SaaS billing of the organization,
 * not a donor recurring gift) and is intentionally not used here.
 */
async function loadActiveSubscriptionCounts(
  donorIds: string[],
  churchId: string,
  attributedUserId?: string,
): Promise<Map<string, number>> {
  const instruments = await prisma.finixPaymentInstrumentSnapshot.findMany({
    where: { churchId, donorId: { in: donorIds } },
    select: { finixPaymentInstrumentId: true, donorId: true },
  });
  const instrumentToDonor = new Map(
    instruments.map((i) => [i.finixPaymentInstrumentId, i.donorId!]),
  );
  const instrumentIds = [...instrumentToDonor.keys()];
  if (instrumentIds.length === 0) return new Map();

  const subs = await prisma.finixSubscription.findMany({
    // FinixSubscription carries attributedUserId directly — no bridging needed.
    where: {
      churchId,
      finixPaymentInstrumentId: { in: instrumentIds },
      state: "ACTIVE",
      ...(attributedUserId ? { attributedUserId } : {}),
    },
    select: { finixPaymentInstrumentId: true },
  });

  const counts = new Map<string, number>();
  for (const s of subs) {
    const donorId = s.finixPaymentInstrumentId
      ? instrumentToDonor.get(s.finixPaymentInstrumentId)
      : undefined;
    if (!donorId) continue;
    counts.set(donorId, (counts.get(donorId) ?? 0) + 1);
  }
  return counts;
}
