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
  | "COLLECTED"
  | "AWAITING_PAYOUT"
  | "PAYOUT_MISSING"
  | "PAYOUT_FAILED"
  | "PAID"
  | "RECEIVED"
  | "NOTHING_OWED";

export interface TransferLike {
  id: string;
  finixBillingTransferId: string;
  createdAtFinix: Date;
  amountCents: number;
  depositType: string;
  state: string;
}

export interface StatementLike {
  id: string;
  windowEnd: Date;
  totalResidualCents: number;
}

/** How long after a month closes Finix normally pays (statement mid-month, payout within ~30 days). */
const PAYOUT_GRACE_DAYS = 45;
/** A transfer more than this long after the month closed isn't matched to it. */
const MATCH_WINDOW_DAYS = 120;

/**
 * Pairs Finix billing transfers with the statements they pay (or collect).
 * The export doesn't name the settlement, so a transfer matches the
 * earliest-closing unmatched statement with the same signed amount (CREDIT
 * = positive residual, DEBIT = negative) that closed before the transfer was
 * created. Pure, so it's unit-tested directly.
 */
export function matchTransfersToStatements<T extends TransferLike, S extends StatementLike>(transfers: T[], statements: S[]) {
  const byStatement = new Map<string, T>();
  const unmatched: T[] = [];
  const ordered = [...statements].sort((a, b) => a.windowEnd.getTime() - b.windowEnd.getTime());
  for (const t of [...transfers].sort((a, b) => a.createdAtFinix.getTime() - b.createdAtFinix.getTime())) {
    const signed = t.depositType === "DEBIT" ? -t.amountCents : t.amountCents;
    const match = ordered.find(
      (st) =>
        !byStatement.has(st.id) &&
        st.totalResidualCents === signed &&
        st.windowEnd.getTime() <= t.createdAtFinix.getTime() &&
        t.createdAtFinix.getTime() - st.windowEnd.getTime() <= MATCH_WINDOW_DAYS * 86_400_000,
    );
    if (match) byStatement.set(match.id, t);
    else unmatched.push(t);
  }
  return { byStatement, unmatched };
}

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
  /** The Finix billing transfer matched to this month's statement, if imported. */
  payout: { finixBillingTransferId: string; createdAt: string; amountCents: number; depositType: string; state: string } | null;
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
    /** Succeeded Finix billing transfers (CREDIT) matched to a statement. */
    paidByFinixCents: number;
    receivedCents: number;
    /** Paid by Finix (or approved) but not yet confirmed in the bank. */
    unconfirmedCents: number;
  };
  /** Approved positive months with no payout seen, past when Finix normally pays. */
  payoutMissingMonths: string[];
  /** Imported transfers that didn't match any statement (e.g. a statement not imported yet). */
  unmatchedTransfers: { finixBillingTransferId: string; createdAt: string; amountCents: number; depositType: string; state: string }[];
  hasTransfers: boolean;
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
  const [charged, statements, transfers] = await Promise.all([
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
    prisma.finixBillingTransfer.findMany({ orderBy: { createdAtFinix: "asc" } }),
  ]);

  const approvedStatements = statements.filter((st) => st.state === "APPROVED");
  const { byStatement: payoutByStatement, unmatched } = matchTransfersToStatements(transfers, approvedStatements);
  const hasTransfers = transfers.length > 0;
  const toPayout = (t: TransferLike) => ({
    finixBillingTransferId: t.finixBillingTransferId,
    createdAt: t.createdAtFinix.toISOString(),
    amountCents: t.amountCents,
    depositType: t.depositType,
    state: t.state,
  });

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

    const payout = s ? payoutByStatement.get(s.id) : undefined;
    const payoutOk = payout?.state === "SUCCEEDED";
    const payoutDue = s ? now.getTime() > s.windowEnd.getTime() + PAYOUT_GRACE_DAYS * 86_400_000 : false;

    let status: ResidualStatus;
    if (k === current.toISOString()) status = "IN_PROGRESS";
    else if (!s) status = now < issueBy || wgcChargedCents === 0 ? "WAITING_ON_FINIX" : "STATEMENT_MISSING";
    else if (s.state !== "APPROVED") status = "PENDING";
    else if (s.totalResidualCents < 0) status = payoutOk ? "COLLECTED" : "NEGATIVE";
    else if (s.totalResidualCents === 0) status = "NOTHING_OWED";
    else if (s.depositReceivedAt) status = "RECEIVED";
    else if (payout && !payoutOk && payout.state !== "PENDING") status = "PAYOUT_FAILED";
    else if (payoutOk) status = "PAID";
    else if (hasTransfers && payoutDue) status = "PAYOUT_MISSING";
    else status = "AWAITING_PAYOUT";

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
      payout: payout ? toPayout(payout) : null,
      feeDifferenceCents: s ? s.merchantFeesCents - wgcChargedCents : null,
      status,
    });
  }

  const approved = approvedStatements;
  const positive = approved.filter((st) => st.totalResidualCents > 0);
  return {
    months,
    totals: {
      feesCents: statements.reduce((t, st) => t + st.merchantFeesCents, 0),
      costsCents: Math.round(statements.reduce((t, st) => t + st.costsCents, 0)),
      residualCents: approved.reduce((t, st) => t + st.totalResidualCents, 0),
      paidByFinixCents: positive.filter((st) => payoutByStatement.get(st.id)?.state === "SUCCEEDED").reduce((t, st) => t + st.totalResidualCents, 0),
      receivedCents: positive.filter((st) => st.depositReceivedAt).reduce((t, st) => t + st.totalResidualCents, 0),
      unconfirmedCents: positive.filter((st) => !st.depositReceivedAt).reduce((t, st) => t + st.totalResidualCents, 0),
    },
    missingStatementMonths: months.filter((mo) => mo.status === "STATEMENT_MISSING").map((mo) => mo.month),
    payoutMissingMonths: months.filter((mo) => mo.status === "PAYOUT_MISSING" || mo.status === "PAYOUT_FAILED").map((mo) => mo.month),
    unmatchedTransfers: unmatched.map(toPayout),
    hasTransfers,
    firstMonth: first?.toISOString() ?? null,
    lastImportedAt: statements.length ? new Date(Math.max(...statements.map((s) => s.updatedAt.getTime()))).toISOString() : null,
  };
}
