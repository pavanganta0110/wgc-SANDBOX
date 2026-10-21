/**
 * Finix platform-residual tracking: WGC's fee revenue as Finix itself
 * reports it, month by month.
 *
 * Finix pays residuals monthly as a "billing settlement": merchant fees
 * charged to organizations, minus network and Finix costs, "normally paid
 * out within 30 days" (docs.finix.com, Platform Residuals). The statements
 * are imported from Finix's dashboard export (FinixResidualSettlement) and
 * are the only reliable source of Finix's real cost. WGC's own record of
 * what it charged each month is shown beside them as a cross-check.
 *
 * Read-only. Never moves money.
 */
import { prisma } from "@/lib/prisma";

export type ResidualStatus =
  | "IN_PROGRESS"
  | "WAITING_ON_FINIX"
  | "STATEMENT_MISSING"
  | "PENDING"
  | "NEGATIVE"
  | "PAID_UNCONFIRMED"
  | "RECEIVED";

export interface ResidualMonth {
  /** ISO date of the first day (UTC) of the month. */
  month: string;
  label: string;
  /** WGC's own record: fees charged on that month's payments (rate snapshot on each Payment). */
  wgcPaymentCount: number;
  wgcChargedCents: number;
  statement: {
    id: string;
    finixBillingSettlementId: string;
    merchantFeesCents: number;
    costsCents: number;
    totalResidualCents: number;
    revSharePercent: number;
    state: string;
    depositReceivedAt: string | null;
    depositNote: string | null;
  } | null;
  /** Finix merchant fees minus WGC's own charged total (payout and other service fees show up here). */
  feeDifferenceCents: number | null;
  status: ResidualStatus;
}

export interface ResidualLedger {
  months: ResidualMonth[];
  totals: {
    feesCents: number;
    costsCents: number;
    residualCents: number;
    receivedCents: number;
    /** Approved, positive residuals not yet confirmed in the bank. */
    unconfirmedCents: number;
  };
  /** Finished months with WGC payments but no Finix statement imported, past when Finix normally issues one. */
  missingStatementMonths: string[];
  firstMonth: string | null;
  lastImportedAt: string | null;
}

const monthKey = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
const addMonths = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
/** Finix issued September's statement on Oct 14; allow until the 20th before calling it missing. */
const STATEMENT_GRACE_DAY = 20;

export async function loadResidualLedger(now: Date = new Date()): Promise<ResidualLedger> {
  const [charged, statements] = await Promise.all([
    prisma.$queryRaw<{ month: Date; payments: bigint; charged: number | null }[]>`
      SELECT date_trunc('month', p."createdAt") AS month,
             COUNT(*) AS payments,
             SUM(ROUND(COALESCE(p."donationAmountCents", 0)::numeric * COALESCE(p."percentageBps", 0) / 10000)
                 + COALESCE(p."fixedFeeCents", 0))::float8 AS charged
      FROM "Payment" p
      WHERE p."status" = 'SUCCEEDED'
      GROUP BY 1
      ORDER BY 1
    `,
    prisma.finixResidualSettlement.findMany({ orderBy: { windowStart: "asc" } }),
  ]);

  const chargedByMonth = new Map(charged.map((r) => [monthKey(new Date(r.month)), r]));
  const statementByMonth = new Map(statements.map((s) => [monthKey(s.windowStart), s]));
  const keys = [...chargedByMonth.keys(), ...statementByMonth.keys()].sort();
  const first = keys[0] ? new Date(keys[0]) : null;
  const current = new Date(monthKey(now));

  const months: ResidualMonth[] = [];
  for (let m = first; m && m <= current; m = addMonths(m, 1)) {
    const k = m.toISOString();
    const c = chargedByMonth.get(k);
    const s = statementByMonth.get(k);
    const wgcChargedCents = Math.round(c?.charged ?? 0);
    const issueBy = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, STATEMENT_GRACE_DAY));

    let status: ResidualStatus;
    if (k === current.toISOString()) status = "IN_PROGRESS";
    else if (!s) status = now < issueBy || wgcChargedCents === 0 ? "WAITING_ON_FINIX" : "STATEMENT_MISSING";
    else if (s.state !== "APPROVED") status = "PENDING";
    else if (s.totalResidualCents < 0) status = "NEGATIVE";
    else if (s.depositReceivedAt) status = "RECEIVED";
    else status = "PAID_UNCONFIRMED";

    // No statement and no WGC activity: skip the empty month entirely.
    if (!s && !c && status !== "IN_PROGRESS") continue;

    months.push({
      month: k,
      label: m.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }),
      wgcPaymentCount: Number(c?.payments ?? 0),
      wgcChargedCents,
      statement: s
        ? {
            id: s.id,
            finixBillingSettlementId: s.finixBillingSettlementId,
            merchantFeesCents: s.merchantFeesCents,
            costsCents: Math.round(s.costsCents),
            totalResidualCents: s.totalResidualCents,
            revSharePercent: s.revSharePercent,
            state: s.state,
            depositReceivedAt: s.depositReceivedAt?.toISOString() ?? null,
            depositNote: s.depositNote,
          }
        : null,
      feeDifferenceCents: s ? s.merchantFeesCents - wgcChargedCents : null,
      status,
    });
  }

  const approved = statements.filter((s) => s.state === "APPROVED");
  return {
    months,
    totals: {
      feesCents: statements.reduce((t, s) => t + s.merchantFeesCents, 0),
      costsCents: Math.round(statements.reduce((t, s) => t + s.costsCents, 0)),
      residualCents: approved.reduce((t, s) => t + s.totalResidualCents, 0),
      receivedCents: approved.filter((s) => s.depositReceivedAt && s.totalResidualCents > 0).reduce((t, s) => t + s.totalResidualCents, 0),
      unconfirmedCents: approved.filter((s) => !s.depositReceivedAt && s.totalResidualCents > 0).reduce((t, s) => t + s.totalResidualCents, 0),
    },
    missingStatementMonths: months.filter((mo) => mo.status === "STATEMENT_MISSING").map((mo) => mo.month),
    firstMonth: first?.toISOString() ?? null,
    lastImportedAt: statements.length ? new Date(Math.max(...statements.map((s) => s.updatedAt.getTime()))).toISOString() : null,
  };
}

/**
 * Finix's real numbers for the whole months a date range touches, used by
 * the WGC profit report. Statements are monthly, so a range that starts or
 * ends mid-month is reported for the whole months it touches.
 */
export async function loadStatementsForRange(from: Date, to: Date) {
  const statements = await prisma.finixResidualSettlement.findMany({
    where: { windowStart: { lt: to }, windowEnd: { gt: from } },
    orderBy: { windowStart: "asc" },
  });
  const monthsInRange: string[] = [];
  for (let m = new Date(monthKey(from)); m <= to; m = addMonths(m, 1)) monthsInRange.push(m.toISOString());
  const covered = new Set(statements.map((s) => monthKey(s.windowStart)));
  return {
    statementCount: statements.length,
    feesCents: statements.reduce((t, s) => t + s.merchantFeesCents, 0),
    costsCents: Math.round(statements.reduce((t, s) => t + s.costsCents, 0)),
    residualCents: statements.reduce((t, s) => t + s.totalResidualCents, 0),
    firstMonth: statements[0] ? monthKey(statements[0].windowStart) : null,
    lastMonth: statements.length ? monthKey(statements[statements.length - 1].windowStart) : null,
    monthsWithoutStatement: monthsInRange.filter((m) => !covered.has(m)),
  };
}
