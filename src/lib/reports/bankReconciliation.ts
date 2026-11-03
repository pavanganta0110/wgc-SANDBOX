import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SUCCESSFUL_CHARGE_WHERE } from "@/lib/admin/platformMetrics";
import { groupFeesByType, type FeeTypeRow } from "@/lib/reports/feeTypes";

/**
 * What an organization collected, what Finix charged it in fees, and what actually reached its bank, summed from
 * Finix's own records with exactly the same definitions as the WGC admin "Money by merchant" table
 * (src/lib/admin/merchantMoneyFlow.ts), so the merchant's Insights and the admin view agree.
 *
 *   charged    — successful charges
 *   refunded   — successful refunds/reversals plus ACH returns
 *   fees       — every WGC platform-fee row Finix recorded for the organization, INCLUDING the fixed fee Finix charges
 *                each time it pays a settlement out to the bank (the "payout fee", about 50 cents per payout)
 *   deposited  — payouts Finix pushed to the bank (funding transfers that are not DEBIT)
 *   pulled back — small fee settlements Finix pulls from the bank (DEBIT funding transfers); money leaving the bank
 *
 * Net after fees = charged − refunded − fees. Awaiting deposit = net − (deposited − pulled back); a non-zero value
 * is usually money still in flight (payouts land one to two business days after payments, and fee rows are not final
 * until about the 15th of the next month). `pendingFeeCount` is how many successful payments have no fee recorded
 * yet, which is exactly when net after fees can be higher than what the bank will receive.
 */
export interface BankReconciliationInput {
  chargedCents: number;
  refundedCents: number;
  feesCents: number;
  payoutFeeCents: number;
  payoutFeeCount: number;
  depositedCents: number;
  depositCount: number;
  pulledBackCents: number;
  pendingFeeCount: number;
}

export interface BankReconciliation extends BankReconciliationInput {
  /** Every kind of fee that applied in the period (card, ACH, payout, returns, validation, ...), never a zero line. */
  feeTypes: FeeTypeRow[];
  netAfterFeesCents: number;
  /** Money deposited to the bank after what Finix pulled back for fees. */
  netDepositedCents: number;
  awaitingDepositCents: number;
}

export function computeBankReconciliation(
  input: BankReconciliationInput,
  feeTypes: FeeTypeRow[] = []
): BankReconciliation {
  const netAfterFeesCents = input.chargedCents - input.refundedCents - input.feesCents;
  const netDepositedCents = input.depositedCents - input.pulledBackCents;
  return { ...input, feeTypes, netAfterFeesCents, netDepositedCents, awaitingDepositCents: netAfterFeesCents - netDepositedCents };
}

const n = (v: bigint | number | null | undefined) => Number(v ?? 0);

function rangeSql(column: Prisma.Sql, dateFilter: { gte: Date; lte?: Date } | undefined): Prisma.Sql {
  if (!dateFilter) return Prisma.sql`TRUE`;
  return dateFilter.lte
    ? Prisma.sql`${column} >= ${dateFilter.gte} AND ${column} <= ${dateFilter.lte}`
    : Prisma.sql`${column} >= ${dateFilter.gte}`;
}

/** Organization-wide only: fees, payouts and refunds cannot be attributed to one team member's own payments. */
export async function getBankReconciliation(
  churchId: string,
  dateFilter: { gte: Date; lte?: Date } | undefined
): Promise<BankReconciliation> {
  const refundRange = dateFilter ? { gte: dateFilter.gte, ...(dateFilter.lte ? { lte: dateFilter.lte } : {}) } : undefined;

  const [charged, refunds, returns, feeRows, deposits, pending] = await Promise.all([
    prisma.$queryRaw<{ amount: bigint | null }[]>`
      SELECT SUM(ft."amountCents") AS amount
      FROM "FinixTransfer" ft
      WHERE ${SUCCESSFUL_CHARGE_WHERE} AND ft."churchId" = ${churchId} AND ${rangeSql(Prisma.sql`ft."createdAtFinix"`, dateFilter)}
    `,
    prisma.finixRefundOrReversal.aggregate({
      where: { churchId, state: { equals: "SUCCEEDED", mode: "insensitive" }, ...(refundRange ? { createdAtFinix: refundRange } : {}) },
      _sum: { amountCents: true },
    }),
    prisma.bankReturn.aggregate({
      where: { churchId, ...(refundRange ? { createdAtFinix: refundRange } : {}) },
      _sum: { amountCents: true },
    }),
    // Every platform-fee row, grouped by fee type: the total is the sum of all of them (same as the admin table), and
    // the breakdown lists each kind of charge that applied.
    prisma.$queryRaw<{ fee_type: string | null; count: bigint; total: number | null }[]>`
      SELECT f."feeType" AS fee_type, COUNT(*) AS count, SUM(f."amountCents") AS total
      FROM "FinixFee" f
      WHERE (f."feeSubtype" = 'PLATFORM_FEE' OR f."feeCategory" = 'PLATFORM_FEE')
        AND f."churchId" = ${churchId} AND ${rangeSql(Prisma.sql`f."createdAtFinix"`, dateFilter)}
      GROUP BY f."feeType"
    `,
    prisma.$queryRaw<{ amount: bigint | null; count: bigint; pulled: bigint | null }[]>`
      SELECT SUM(d."amountCents") FILTER (WHERE UPPER(COALESCE(d."rawJsonRedacted"->>'type', 'CREDIT')) <> 'DEBIT') AS amount,
             COUNT(*) FILTER (WHERE UPPER(COALESCE(d."rawJsonRedacted"->>'type', 'CREDIT')) <> 'DEBIT') AS count,
             SUM(d."amountCents") FILTER (WHERE UPPER(COALESCE(d."rawJsonRedacted"->>'type', 'CREDIT')) = 'DEBIT') AS pulled
      FROM "FinixFundingTransferAttempt" d
      WHERE UPPER(d."state") = 'SUCCEEDED' AND d."churchId" = ${churchId} AND ${rangeSql(Prisma.sql`d."createdAtFinix"`, dateFilter)}
    `,
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) AS count
      FROM "FinixTransfer" ft
      WHERE ${SUCCESSFUL_CHARGE_WHERE} AND ft."churchId" = ${churchId} AND ${rangeSql(Prisma.sql`ft."createdAtFinix"`, dateFilter)}
        AND NOT EXISTS (SELECT 1 FROM "FinixFee" f WHERE f."linkedToId" = ft."finixTransferId")
    `,
  ]);

  const rawRows = feeRows.map((r) => ({ feeType: r.fee_type, count: n(r.count), amount: Number(r.total ?? 0) }));
  const feeTypes = groupFeesByType(rawRows);
  // The payouts themselves (one fixed fee each); return and correction fees on a payout are listed in feeTypes but
  // are not payouts.
  const payoutLines = feeTypes.filter((f) => f.isPayoutFee);
  const payoutRuns = feeTypes.filter((f) => f.key === "PAYOUT" || f.key === "PAYOUT_SAME_DAY" || f.key === "PAYOUT_INSTANT");

  return computeBankReconciliation(
    {
      chargedCents: n(charged[0]?.amount),
      refundedCents: (refunds._sum.amountCents ?? 0) + (returns._sum.amountCents ?? 0),
      // Finix fee amounts carry fractions of a cent; add them all, then round once, never per row.
      feesCents: Math.round(rawRows.reduce((s, r) => s + r.amount, 0)),
      payoutFeeCents: payoutLines.reduce((s, f) => s + f.amountCents, 0),
      payoutFeeCount: payoutRuns.reduce((s, f) => s + f.count, 0),
      depositedCents: n(deposits[0]?.amount),
      depositCount: n(deposits[0]?.count),
      pulledBackCents: n(deposits[0]?.pulled),
      pendingFeeCount: n(pending[0]?.count),
    },
    feeTypes
  );
}
