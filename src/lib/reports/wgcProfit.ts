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

  // WGC's own fee (feeSubtype "PLATFORM_FEE") is excluded here — it's
  // WGC's revenue, already counted via wgcChargedCents below, not a real
  // Finix/processor cost. Everything else (interchange, processor markup,
  // dues and assessments, settlement funding, etc.) counts as real cost.
  const feeRows = transferIds.length
    ? await prisma.finixFee.findMany({
        where: {
          linkedToId: { in: transferIds },
          feeSubtype: { not: "PLATFORM_FEE" },
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

  return {
    rangeFrom: from,
    rangeTo: to,
    paymentCount: payments.length,
    wgcChargedCents: totalWgcCharged,
    finixCostCents: totalFinixCost,
    profitCents: totalWgcCharged - totalFinixCost,
    paymentsMissingFeeDataCount: missingFeeDataCount,
    byOrganization: [...byOrgMap.values()]
      .map((o) => ({ ...o, profitCents: o.wgcChargedCents - o.finixCostCents }))
      .sort((a, b) => b.profitCents - a.profitCents),
  };
}
