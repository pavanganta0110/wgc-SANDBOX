/**
 * Per-organization money flow for the WGC admin dashboard: what each
 * organization collected, what it was charged in fees, and what Finix has
 * actually sent to its bank account. Read-only.
 *
 * Every figure is summed in Postgres from Finix's own records:
 *   collected  — successful charges (FinixTransfer, same rule as the
 *                dashboard's Total processed), attributed organizations only
 *   refunded   — successful refunds/reversals + ACH returns (FinixRefundOrReversal, BankReturn)
 *   fees       — PLATFORM_FEE rows (FinixFee); donor-covered supplemental
 *                fees are a subset of this, shown separately
 *   deposited  — payouts Finix pushed TO the organization's bank (SUCCEEDED
 *                funding transfers of type CREDIT)
 *   pulled back — small fee settlements Finix pulls FROM the organization's
 *                bank (SUCCEEDED funding transfers of type DEBIT, "pull from
 *                ACH"). They are money leaving the bank, never a deposit.
 *
 * "Awaiting deposit" = collected − refunded − fees − (deposited − pulled back). It is a
 * reconciliation line, not an error: settlements land on a delay and fee
 * rows aren't final until about the 15th of the next month, so a non-zero
 * value usually just means money that is still in flight. A negative value
 * (deposited more than expected) is flagged for a look.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SUCCESSFUL_CHARGE_WHERE, inRange, type AdminPeriod } from "./platformMetrics";

export interface MerchantMoneyRow {
  churchId: string;
  name: string;
  collectedCents: number;
  paymentCount: number;
  refundedCents: number;
  feesCents: number;
  /** Finix's per-payout fee (about 50¢ each) — already included in feesCents, broken out so it's visible. */
  payoutFeeCents: number;
  payoutFeeCount: number;
  donorCoveredFeesCents: number;
  /** Successful payments where the donor chose to cover the processing fee. */
  donorCoveredCount: number;
  /** Successful payments where the organization absorbed the fee. */
  orgPaidCount: number;
  /** Charges with no WGC payment record (e.g. created straight in the Finix dashboard), so who paid the fee isn't known. */
  noFeeRecordCount: number;
  depositedCents: number;
  depositCount: number;
  pulledBackCents: number;
  awaitingDepositCents: number;
}

export interface MerchantMoneyFlow {
  rows: MerchantMoneyRow[];
  totals: Omit<MerchantMoneyRow, "churchId" | "name">;
}

const n = (v: bigint | number | null | undefined) => Number(v ?? 0);

export function awaitingDeposit(
  row: Pick<MerchantMoneyRow, "collectedCents" | "refundedCents" | "feesCents" | "depositedCents" | "pulledBackCents">,
): number {
  return row.collectedCents - row.refundedCents - row.feesCents - (row.depositedCents - row.pulledBackCents);
}

export async function loadMerchantMoneyFlow(period: AdminPeriod): Promise<MerchantMoneyFlow> {
  const created = Prisma.sql`ft."createdAtFinix"`;

  const [charges, refunds, returns, fees, deposits, coverage, payoutFees, churches] = await Promise.all([
    prisma.$queryRaw<{ church_id: string; amount: bigint | null; count: bigint }[]>`
      SELECT ft."churchId" AS church_id, SUM(ft."amountCents") AS amount, COUNT(*) AS count
      FROM "FinixTransfer" ft
      WHERE ${SUCCESSFUL_CHARGE_WHERE}
        AND EXISTS (SELECT 1 FROM "Church" c_attr WHERE c_attr."id" = ft."churchId")
        AND ${inRange(created, period.from, period.to)}
      GROUP BY ft."churchId"
    `,
    prisma.finixRefundOrReversal.groupBy({
      by: ["churchId"],
      where: {
        churchId: { not: null },
        state: { equals: "SUCCEEDED", mode: "insensitive" },
        createdAtFinix: period.from ? { gte: period.from, lt: period.to } : { lt: period.to },
      },
      _sum: { amountCents: true },
    }),
    prisma.bankReturn.groupBy({
      by: ["churchId"],
      where: { churchId: { not: null }, createdAtFinix: period.from ? { gte: period.from, lt: period.to } : { lt: period.to } },
      _sum: { amountCents: true },
    }),
    prisma.$queryRaw<{ church_id: string; fees: number | null; donor_covered: number | null }[]>`
      SELECT f."churchId" AS church_id,
             SUM(f."amountCents") AS fees,
             SUM(f."amountCents") FILTER (WHERE f."feeType" ILIKE '%SUPPLEMENTAL%') AS donor_covered
      FROM "FinixFee" f
      WHERE (f."feeSubtype" = 'PLATFORM_FEE' OR f."feeCategory" = 'PLATFORM_FEE')
        AND f."churchId" IS NOT NULL
        AND ${inRange(Prisma.sql`f."createdAtFinix"`, period.from, period.to)}
      GROUP BY f."churchId"
    `,
    // Finix moves money both ways: CREDIT = payout pushed to the merchant's
    // bank; DEBIT = a small fee settlement pulled back from it. A transfer
    // with no recorded direction is treated as a payout (the common case).
    prisma.$queryRaw<{ church_id: string; amount: bigint | null; count: bigint; pulled: bigint | null }[]>`
      SELECT d."churchId" AS church_id,
             SUM(d."amountCents") FILTER (WHERE UPPER(COALESCE(d."rawJsonRedacted"->>'type', 'CREDIT')) <> 'DEBIT') AS amount,
             COUNT(*) FILTER (WHERE UPPER(COALESCE(d."rawJsonRedacted"->>'type', 'CREDIT')) <> 'DEBIT') AS count,
             SUM(d."amountCents") FILTER (WHERE UPPER(COALESCE(d."rawJsonRedacted"->>'type', 'CREDIT')) = 'DEBIT') AS pulled
      FROM "FinixFundingTransferAttempt" d
      WHERE UPPER(d."state") = 'SUCCEEDED'
        AND d."churchId" IS NOT NULL
        AND ${inRange(Prisma.sql`d."createdAtFinix"`, period.from, period.to)}
      GROUP BY d."churchId"
    `,
    // Who paid the processing fee: Payment.donorCoversFee is recorded when the
    // gift is made; false = the organization absorbed it.
    prisma.$queryRaw<{ church_id: string; covered: bigint; org_paid: bigint }[]>`
      SELECT p."churchId" AS church_id,
             COUNT(*) FILTER (WHERE p."donorCoversFee" IS TRUE) AS covered,
             COUNT(*) FILTER (WHERE p."donorCoversFee" IS FALSE) AS org_paid
      FROM "Payment" p
      WHERE UPPER(p."status") = 'SUCCEEDED'
        AND p."churchId" IS NOT NULL
        AND ${inRange(Prisma.sql`p."createdAt"`, period.from, period.to)}
      GROUP BY p."churchId"
    `,
    // Finix charges a fixed fee (50¢) every time it pays a settlement out to
    // the merchant's bank. These are PLATFORM_FEE rows of the
    // SETTLEMENT_FUNDING_TRANSFER_* types, so they are already inside
    // "fees"; this query only breaks them out.
    prisma.$queryRaw<{ church_id: string; total: number | null; count: bigint }[]>`
      SELECT f."churchId" AS church_id, SUM(f."amountCents") AS total, COUNT(*) AS count
      FROM "FinixFee" f
      WHERE f."feeType" ILIKE 'SETTLEMENT_FUNDING_TRANSFER%'
        AND f."churchId" IS NOT NULL
        AND ${inRange(Prisma.sql`f."createdAtFinix"`, period.from, period.to)}
      GROUP BY f."churchId"
    `,
    prisma.church.findMany({ select: { id: true, name: true } }),
  ]);

  const names = new Map(churches.map((c) => [c.id, c.name]));
  const byChurch = new Map<string, MerchantMoneyRow>();
  const row = (churchId: string): MerchantMoneyRow => {
    let r = byChurch.get(churchId);
    if (!r) {
      r = {
        churchId,
        name: names.get(churchId) ?? "Unknown merchant",
        collectedCents: 0,
        paymentCount: 0,
        refundedCents: 0,
        feesCents: 0,
        payoutFeeCents: 0,
        payoutFeeCount: 0,
        donorCoveredFeesCents: 0,
        donorCoveredCount: 0,
        orgPaidCount: 0,
        noFeeRecordCount: 0,
        depositedCents: 0,
        depositCount: 0,
        pulledBackCents: 0,
        awaitingDepositCents: 0,
      };
      byChurch.set(churchId, r);
    }
    return r;
  };

  for (const c of charges) {
    const r = row(c.church_id);
    r.collectedCents += n(c.amount);
    r.paymentCount += n(c.count);
  }
  for (const x of refunds) if (x.churchId) row(x.churchId).refundedCents += x._sum.amountCents ?? 0;
  for (const x of returns) if (x.churchId) row(x.churchId).refundedCents += x._sum.amountCents ?? 0;
  for (const f of fees) {
    const r = row(f.church_id);
    // Finix fee amounts carry fractions of a cent; round once per organization, never per row.
    r.feesCents += Math.round(f.fees ?? 0);
    r.donorCoveredFeesCents += Math.round(f.donor_covered ?? 0);
  }
  for (const d of deposits) {
    const r = row(d.church_id);
    r.depositedCents += n(d.amount);
    r.depositCount += n(d.count);
    r.pulledBackCents += n(d.pulled);
  }
  for (const p of coverage) {
    // Only merchants that also have charges in the period appear in the table.
    const r = byChurch.get(p.church_id);
    if (!r) continue;
    r.donorCoveredCount += n(p.covered);
    r.orgPaidCount += n(p.org_paid);
  }
  for (const p of payoutFees) {
    const r = byChurch.get(p.church_id);
    if (!r) continue;
    r.payoutFeeCents += Math.round(p.total ?? 0);
    r.payoutFeeCount += n(p.count);
  }

  const rows = [...byChurch.values()]
    .map((r) => ({
      ...r,
      noFeeRecordCount: Math.max(0, r.paymentCount - r.donorCoveredCount - r.orgPaidCount),
      awaitingDepositCents: awaitingDeposit(r),
    }))
    .sort((a, b) => b.collectedCents - a.collectedCents || a.name.localeCompare(b.name));

  const totals = rows.reduce(
    (t, r) => ({
      collectedCents: t.collectedCents + r.collectedCents,
      paymentCount: t.paymentCount + r.paymentCount,
      refundedCents: t.refundedCents + r.refundedCents,
      feesCents: t.feesCents + r.feesCents,
      payoutFeeCents: t.payoutFeeCents + r.payoutFeeCents,
      payoutFeeCount: t.payoutFeeCount + r.payoutFeeCount,
      donorCoveredFeesCents: t.donorCoveredFeesCents + r.donorCoveredFeesCents,
      donorCoveredCount: t.donorCoveredCount + r.donorCoveredCount,
      orgPaidCount: t.orgPaidCount + r.orgPaidCount,
      noFeeRecordCount: t.noFeeRecordCount + r.noFeeRecordCount,
      depositedCents: t.depositedCents + r.depositedCents,
      depositCount: t.depositCount + r.depositCount,
      pulledBackCents: t.pulledBackCents + r.pulledBackCents,
      awaitingDepositCents: t.awaitingDepositCents + r.awaitingDepositCents,
    }),
    {
      collectedCents: 0,
      paymentCount: 0,
      refundedCents: 0,
      feesCents: 0,
      payoutFeeCents: 0,
      payoutFeeCount: 0,
      donorCoveredFeesCents: 0,
      donorCoveredCount: 0,
      orgPaidCount: 0,
      noFeeRecordCount: 0,
      depositedCents: 0,
      depositCount: 0,
      pulledBackCents: 0,
      awaitingDepositCents: 0,
    },
  );

  return { rows, totals };
}
