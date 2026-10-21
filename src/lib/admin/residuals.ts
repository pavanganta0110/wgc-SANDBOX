/**
 * Finix platform-residual tracking: what Finix should be paying WGC each
 * month vs what has actually been received.
 *
 * Expected residual = what WGC charged merchants (the fee-profile /
 * supplemental fee, reconstructed from the rate snapshotted on each Payment)
 * minus Finix's own cost (FinixFee rows that aren't WGC's PLATFORM_FEE).
 * Same formula as src/lib/reports/wgcProfit.ts, but grouped by month and
 * summed in Postgres. Finix pays residuals monthly as a "billing
 * settlement", "normally paid out within 30 days of the billing settlement
 * being created" (docs.finix.com, Platform Residuals). There's no API for
 * billing settlements, so payouts are recorded by hand (FinixResidualPayout).
 *
 * Read-only. Never moves money.
 */
import { prisma } from "@/lib/prisma";
import { reconciledThroughDate } from "@/lib/reports/wgcProfit";

export type ResidualStatus = "IN_PROGRESS" | "NOT_DUE" | "OVERDUE" | "PARTIAL" | "PAID" | "NOTHING_OWED";

export interface ResidualMonth {
  /** ISO date of the first day (UTC) of the month. */
  month: string;
  label: string;
  paymentCount: number;
  chargedCents: number;
  finixCostCents: number;
  expectedCents: number;
  paidCents: number;
  /** Payments whose Finix fee lines haven't synced, so cost counts as $0 (overstates expected). */
  missingFeeDataCount: number;
  /** Finix's cost data for this month is final (past the 16th of the next month). */
  isFinal: boolean;
  /** When we'd expect the payout: about 30 days after the month's billing settlement (start of month + 2). */
  expectedBy: string;
  status: ResidualStatus;
}

export interface ResidualPayoutRow {
  id: string;
  month: string;
  amountCents: number;
  receivedAt: string;
  finixBillingSettlementId: string | null;
  note: string | null;
  recordedByEmail: string;
}

export interface ResidualLedger {
  months: ResidualMonth[];
  payouts: ResidualPayoutRow[];
  /** Sum of expected residuals for months whose payout is already due. */
  dueCents: number;
  /** Sum of every recorded payout. */
  paidCents: number;
  /** dueCents - paidCents (positive = Finix owes WGC). */
  outstandingCents: number;
  /** Expected residual for months not due yet (current month included). */
  upcomingCents: number;
  firstMonth: string | null;
  oldestOverdueMonth: string | null;
  daysOverdue: number | null;
}

const monthKey = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
const addMonths = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
const n = (v: bigint | number | null | undefined) => Number(v ?? 0);

export async function loadResidualLedger(now: Date = new Date()): Promise<ResidualLedger> {
  const [rows, payoutRows] = await Promise.all([
    prisma.$queryRaw<{ month: Date; payments: bigint; charged: number | null; cost: number | null; missing: bigint }[]>`
      WITH pay AS (
        SELECT p."finixTransferId",
               date_trunc('month', p."createdAt") AS month,
               ROUND(COALESCE(p."donationAmountCents", 0)::numeric * COALESCE(p."percentageBps", 0) / 10000)
                 + COALESCE(p."fixedFeeCents", 0) AS charged
        FROM "Payment" p
        WHERE p."status" = 'SUCCEEDED'
      ),
      cost AS (
        SELECT f."linkedToId", SUM(f."amountCents") AS cost
        FROM "FinixFee" f
        WHERE f."linkedToId" IS NOT NULL
          AND COALESCE(f."feeSubtype", '') <> 'PLATFORM_FEE'
          AND COALESCE(f."feeCategory", '') <> 'PLATFORM_FEE'
        GROUP BY f."linkedToId"
      ),
      fee_seen AS (
        SELECT DISTINCT f."linkedToId" FROM "FinixFee" f WHERE f."linkedToId" IS NOT NULL
      )
      SELECT pay.month,
             COUNT(*) AS payments,
             SUM(pay.charged)::float8 AS charged,
             SUM(COALESCE(cost.cost, 0))::float8 AS cost,
             COUNT(*) FILTER (WHERE fee_seen."linkedToId" IS NULL) AS missing
      FROM pay
      LEFT JOIN cost ON cost."linkedToId" = pay."finixTransferId"
      LEFT JOIN fee_seen ON fee_seen."linkedToId" = pay."finixTransferId"
      GROUP BY pay.month
      ORDER BY pay.month
    `,
    prisma.finixResidualPayout.findMany({ orderBy: [{ periodMonth: "desc" }, { receivedAt: "desc" }] }),
  ]);

  const byMonth = new Map(rows.map((r) => [monthKey(new Date(r.month)), r]));
  const paidByMonth = new Map<string, number>();
  for (const p of payoutRows) {
    const k = monthKey(p.periodMonth);
    paidByMonth.set(k, (paidByMonth.get(k) ?? 0) + p.amountCents);
  }

  const keys = [...byMonth.keys(), ...paidByMonth.keys()].sort();
  const first = keys[0] ? new Date(keys[0]) : null;
  const current = new Date(monthKey(now));
  const reconciledThrough = reconciledThroughDate(now);

  const months: ResidualMonth[] = [];
  for (let m = first; m && m <= current; m = addMonths(m, 1)) {
    const k = m.toISOString();
    const r = byMonth.get(k);
    const charged = Math.round(r?.charged ?? 0);
    const cost = Math.round(r?.cost ?? 0);
    const expected = charged - cost;
    const paid = paidByMonth.get(k) ?? 0;
    const expectedBy = addMonths(m, 2);

    let status: ResidualStatus;
    if (m.getTime() === current.getTime()) status = "IN_PROGRESS";
    else if (paid > 0 && paid >= expected) status = "PAID";
    else if (paid > 0) status = "PARTIAL";
    else if (expected <= 0) status = "NOTHING_OWED";
    else if (now < expectedBy) status = "NOT_DUE";
    else status = "OVERDUE";

    months.push({
      month: k,
      label: m.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }),
      paymentCount: n(r?.payments),
      chargedCents: charged,
      finixCostCents: cost,
      expectedCents: expected,
      paidCents: paid,
      missingFeeDataCount: n(r?.missing),
      isFinal: addMonths(m, 1) <= reconciledThrough,
      expectedBy: expectedBy.toISOString(),
      status,
    });
  }

  const isDue = (mo: ResidualMonth) => now >= new Date(mo.expectedBy);
  const dueCents = months.filter(isDue).reduce((s, mo) => s + Math.max(mo.expectedCents, 0), 0);
  const upcomingCents = months.filter((mo) => !isDue(mo)).reduce((s, mo) => s + Math.max(mo.expectedCents, 0), 0);
  const paidCents = payoutRows.reduce((s, p) => s + p.amountCents, 0);
  const oldest = months.find((mo) => mo.status === "OVERDUE" || (mo.status === "PARTIAL" && isDue(mo)));

  return {
    months,
    payouts: payoutRows.map((p) => ({
      id: p.id,
      month: monthKey(p.periodMonth),
      amountCents: p.amountCents,
      receivedAt: p.receivedAt.toISOString(),
      finixBillingSettlementId: p.finixBillingSettlementId,
      note: p.note,
      recordedByEmail: p.recordedByEmail,
    })),
    dueCents,
    paidCents,
    outstandingCents: dueCents - paidCents,
    upcomingCents,
    firstMonth: first?.toISOString() ?? null,
    oldestOverdueMonth: oldest?.month ?? null,
    daysOverdue: oldest ? Math.floor((now.getTime() - new Date(oldest.expectedBy).getTime()) / 86_400_000) : null,
  };
}
