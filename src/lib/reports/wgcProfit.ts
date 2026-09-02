import { prisma } from "@/lib/prisma";

/**
 * WGC-admin-only profit reporting: (what WGC charged) minus (what Finix
 * actually charged WGC). Deliberately separate from
 * Payment.actualFinixFeesCents — that field is already relied on by
 * merchant-facing Aplos exports (contributionBuilder.ts,
 * settlementReconciliation.ts) and is computed with an older, confirmed-
 * imprecise heuristic (excludes feeType containing "APPLICATION," which
 * misses rows like a CARD_BASIS_POINTS fee whose feeSubtype is actually
 * "PLATFORM_FEE"). This module recomputes the real Finix cost fresh from
 * FinixFee.feeSubtype, which is the correct, network-agnostic signal, and
 * never writes back to Payment or anything merchant-visible.
 *
 * "WGC charged" is reconstructed from the exact rate snapshotted on each
 * Payment at charge time (percentageBps, fixedFeeCents, donationAmountCents)
 * — this is the same formula feeCalculator.ts applied when the fee was
 * decided, so it's exact, not an estimate, regardless of whether the
 * donor or the organization paid it.
 */

/** The last calendar-month boundary through which Finix's own interchange/
 * dues-and-assessments data is expected to be fully landed — per Finix's
 * Consolidated Fees Reports docs, a given month's passthrough fee data
 * "can be incomplete or blank until Finix receives and processes all data
 * up to the 15th day of the following month." A payment from month M is
 * only considered reconciled once "now" is past the 16th of month M+1
 * (the resync-monthly-transfer-fees cron's own schedule). Exported so the
 * UI can label any requested range as fully reconciled, partially
 * reconciled, or entirely preliminary. */
export function reconciledThroughDate(now: Date = new Date()): Date {
  const cutoffDay = 16;
  // If we're on/after the 16th, this month's own prior month has cleared
  // its reconciliation window; before the 16th, only two months back has.
  const monthsBack = now.getUTCDate() >= cutoffDay ? 1 : 2;
  // End of the reconciled month = start of the month after it.
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsBack + 1, 1, 0, 0, 0));
}

export interface WgcProfitSummary {
  rangeFrom: Date;
  rangeTo: Date;
  paymentCount: number;
  wgcChargedCents: number;
  finixCostCents: number;
  profitCents: number;
  /** Payments in range with no synced Finix fee data at all yet — their
   * Finix cost is treated as 0 in the totals above, which understates
   * finixCostCents and overstates profitCents. Always show this count
   * alongside the totals so it's never read as more complete than it is. */
  paymentsMissingFeeDataCount: number;
  /** True only when the entire requested range's Finix passthrough-fee
   * data is expected to have fully landed (see reconciledThroughDate) —
   * false means some or all of finixCostCents/profitCents in this
   * response is preliminary and will change once reconciliation runs. */
  isFullyReconciled: boolean;
  /** The actual date used to decide isFullyReconciled — surfaced so the
   * UI can explain *why* (e.g. "reconciled through July 31; August isn't
   * final until September 16"). */
  reconciledThrough: Date;
  byOrganization: Array<{
    churchId: string;
    churchName: string;
    paymentCount: number;
    wgcChargedCents: number;
    finixCostCents: number;
    profitCents: number;
  }>;
}

export async function getWgcProfitSummary(params: { from: Date; to: Date; churchId?: string }): Promise<WgcProfitSummary> {
  const { from, to, churchId } = params;

  const payments = await prisma.payment.findMany({
    where: {
      status: "SUCCEEDED",
      createdAt: { gte: from, lte: to },
      ...(churchId ? { churchId } : {}),
    },
    select: {
      id: true,
      churchId: true,
      finixTransferId: true,
      donationAmountCents: true,
      percentageBps: true,
      fixedFeeCents: true,
    },
  });

  const transferIds = payments.map((p) => p.finixTransferId).filter((id): id is string => !!id);

  // WGC's own fee is excluded here — it's WGC's revenue, already counted
  // via wgcChargedCents below, not a real Finix/processor cost. Checks
  // both feeSubtype and feeCategory for "PLATFORM_FEE": every real row
  // captured so far only ever populates feeSubtype, but Finix's own docs
  // describe feeCategory (PLATFORM_FEE / PASSTHROUGH_FEE / PROGRAM_FEE) as
  // the documented field for this — checking both means real
  // PASSTHROUGH_FEE data (interchange, dues and assessments) is correctly
  // counted as cost the moment it starts appearing, however Finix
  // populates it. Everything else counts as real cost.
  const feeRows = transferIds.length
    ? await prisma.finixFee.findMany({
        where: {
          linkedToId: { in: transferIds },
          NOT: [{ feeSubtype: "PLATFORM_FEE" }, { feeCategory: "PLATFORM_FEE" }],
        },
        select: { linkedToId: true, amountCents: true },
      })
    : [];

  const finixCostByTransfer = new Map<string, number>();
  for (const row of feeRows) {
    if (!row.linkedToId || row.amountCents == null) continue;
    finixCostByTransfer.set(row.linkedToId, (finixCostByTransfer.get(row.linkedToId) ?? 0) + row.amountCents);
  }

  const churchIds = [...new Set(payments.map((p) => p.churchId))];
  const churches = churchIds.length ? await prisma.church.findMany({ where: { id: { in: churchIds } }, select: { id: true, name: true } }) : [];
  const churchNameById = new Map(churches.map((c) => [c.id, c.name]));

  const byOrgMap = new Map<string, { churchId: string; churchName: string; paymentCount: number; wgcChargedCents: number; finixCostCents: number }>();

  let totalWgcCharged = 0;
  let totalFinixCost = 0;
  let missingFeeDataCount = 0;

  for (const payment of payments) {
    const wgcChargedCents = Math.round(((payment.donationAmountCents ?? 0) * (payment.percentageBps ?? 0)) / 10000) + (payment.fixedFeeCents ?? 0);
    const finixCostCents = payment.finixTransferId ? finixCostByTransfer.get(payment.finixTransferId) : undefined;
    const resolvedFinixCostCents = Math.round(finixCostCents ?? 0);
    if (finixCostCents == null) missingFeeDataCount += 1;

    totalWgcCharged += wgcChargedCents;
    totalFinixCost += resolvedFinixCostCents;

    const org = byOrgMap.get(payment.churchId) ?? {
      churchId: payment.churchId,
      churchName: churchNameById.get(payment.churchId) ?? "Unknown Organization",
      paymentCount: 0,
      wgcChargedCents: 0,
      finixCostCents: 0,
    };
    org.paymentCount += 1;
    org.wgcChargedCents += wgcChargedCents;
    org.finixCostCents += resolvedFinixCostCents;
    byOrgMap.set(payment.churchId, org);
  }

  const reconciledThrough = reconciledThroughDate();

  return {
    rangeFrom: from,
    rangeTo: to,
    paymentCount: payments.length,
    wgcChargedCents: totalWgcCharged,
    finixCostCents: totalFinixCost,
    profitCents: totalWgcCharged - totalFinixCost,
    paymentsMissingFeeDataCount: missingFeeDataCount,
    isFullyReconciled: to <= reconciledThrough,
    reconciledThrough,
    byOrganization: [...byOrgMap.values()]
      .map((o) => ({ ...o, profitCents: o.wgcChargedCents - o.finixCostCents }))
      .sort((a, b) => b.profitCents - a.profitCents),
  };
}
