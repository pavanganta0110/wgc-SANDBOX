import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Dashboard-home helpers: sparkline buckets, the previous-period window and
 * the "needs attention" counts. Everything is aggregated in Postgres — none
 * of it fetches an organization's payment rows — so load time stays flat as
 * history grows (see dashboardScaleRegression.test.ts).
 *
 * Money rules — the same base set as the Insights page and the summary tiles:
 * FinixTransfer rows for the church, state SUCCEEDED (case-insensitive),
 * settlement transfers excluded, amounts gross (before refunds). A team or
 * fundraiser view (attributedUserId) is bridged through
 * Payment.attributedUserId, exactly like buildFinixTransferScope.
 */

export interface TimeWindow {
  /** Inclusive. */
  start: Date;
  /** Exclusive. */
  end: Date;
}

export interface WindowAggregate {
  volumeCents: number;
  count: number;
}

/**
 * One query for N windows (sparkline buckets): unnest the windows, left-join
 * the already time-bounded succeeded-transfer set, group by window. The scan
 * is bounded to [min(start), max(end)) and uses the (churchId, createdAtFinix)
 * index.
 */
export async function aggregateWindows(params: {
  churchId: string;
  attributedUserId?: string;
  windows: TimeWindow[];
}): Promise<WindowAggregate[]> {
  const { churchId, attributedUserId, windows } = params;
  if (windows.length === 0) return [];
  const starts = windows.map((w) => w.start.toISOString());
  const ends = windows.map((w) => w.end.toISOString());

  const rows = await prisma.$queryRaw<{ idx: bigint | number; vol: bigint | number; cnt: bigint | number }[]>(Prisma.sql`
    WITH w AS (
      SELECT x.s, x.e, x.idx
      FROM unnest(${starts}::timestamptz[], ${ends}::timestamptz[]) WITH ORDINALITY AS x(s, e, idx)
    ),
    base AS (
      SELECT t."createdAtFinix" AS ts, COALESCE(t."amountCents", 0) AS amt
      FROM "FinixTransfer" t
      ${attributedUserId ? Prisma.sql`JOIN "Payment" p ON p."finixTransferId" = t."finixTransferId" AND p."churchId" = t."churchId" AND p."attributedUserId" = ${attributedUserId}` : Prisma.empty}
      WHERE t."churchId" = ${churchId}
        AND UPPER(t.state) = 'SUCCEEDED'
        AND (t.subtype IS NULL OR t.subtype NOT LIKE '%SETTLEMENT%')
        AND t."createdAtFinix" >= (SELECT MIN(s) FROM w)
        AND t."createdAtFinix" < (SELECT MAX(e) FROM w)
    )
    SELECT w.idx, COALESCE(SUM(b.amt), 0)::bigint AS vol, COUNT(b.ts)::bigint AS cnt
    FROM w
    LEFT JOIN base b ON b.ts >= w.s AND b.ts < w.e
    GROUP BY w.idx
    ORDER BY w.idx
  `);

  return rows.map((r) => ({ volumeCents: Number(r.vol), count: Number(r.cnt) }));
}

/** The equal-length window immediately before [start, end). */
export function previousWindow(start: Date, end: Date): TimeWindow {
  const length = end.getTime() - start.getTime();
  return { start: new Date(start.getTime() - length), end: new Date(start.getTime()) };
}

/** Splits [start, end) into `count` equal, contiguous windows (sparklines). */
export function splitWindow(start: Date, end: Date, count: number): TimeWindow[] {
  const total = end.getTime() - start.getTime();
  if (total <= 0 || count <= 0) return [];
  const step = total / count;
  return Array.from({ length: count }, (_, i) => ({
    start: new Date(start.getTime() + step * i),
    end: new Date(i === count - 1 ? end.getTime() : start.getTime() + step * (i + 1)),
  }));
}

// ------------------------------------------------------ needs attention

export type AttentionKey = "disputes" | "failedPayments" | "failedRefunds" | "achReturns";

export interface AttentionItem {
  key: AttentionKey;
  count: number;
  label: string;
  href: string;
}

const ATTENTION_META: Record<AttentionKey, { singular: string; plural: string; href: string }> = {
  disputes: { singular: "open dispute", plural: "open disputes", href: "/merchant/disputes?tab=needs_attention" },
  failedPayments: {
    singular: "failed payment",
    plural: "failed payments",
    href: "/merchant/transactions/payments?state=FAILED",
  },
  failedRefunds: { singular: "failed refund", plural: "failed refunds", href: "/merchant/transactions/refunds" },
  achReturns: { singular: "ACH return", plural: "ACH returns", href: "/merchant/transactions/bank-returns" },
};

/** Pure: turns raw counts into the chips to show. Zero-count items are
 * dropped, so an empty result means "all clear". */
export function buildAttentionItems(counts: Record<AttentionKey, number>): AttentionItem[] {
  return (Object.keys(ATTENTION_META) as AttentionKey[])
    .filter((key) => counts[key] > 0)
    .map((key) => {
      const meta = ATTENTION_META[key];
      return {
        key,
        count: counts[key],
        label: `${counts[key].toLocaleString("en-US")} ${counts[key] === 1 ? meta.singular : meta.plural}`,
        href: meta.href,
      };
    });
}

/**
 * Counts for the strip. Failed refunds come from the dashboard's own refund
 * aggregate (same figure as the "Failed Refund Count" tile), passed in so it
 * is never computed twice.
 */
export async function getAttentionCounts(p: {
  churchId: string;
  dateFilter?: { gte: Date; lte?: Date };
  transferScope: Prisma.FinixTransferWhereInput;
  failedRefundCount: number;
  /** Bank returns carry no attribution: a user-scoped view bridges via the
   * user's own transfer ids. undefined = organization scope. */
  scopedTransferIds?: string[];
}): Promise<Record<AttentionKey, number>> {
  const { churchId, dateFilter, transferScope, failedRefundCount, scopedTransferIds } = p;
  const [disputes, failedPayments, achReturns] = await Promise.all([
    // Disputes stay organization-wide, matching the existing dashboard tiles
    // (no reliable per-user attribution — CP4C policy). "Open" = pending.
    prisma.finixDispute.count({ where: { churchId, state: { equals: "pending", mode: "insensitive" } } }),
    prisma.finixTransfer.count({
      where: {
        ...transferScope,
        state: { equals: "FAILED", mode: "insensitive" },
        ...(dateFilter ? { createdAtFinix: dateFilter } : {}),
      },
    }),
    prisma.bankReturn.count({
      where: {
        churchId,
        ...(dateFilter ? { createdAtFinix: dateFilter } : {}),
        ...(scopedTransferIds ? { originalTransferId: { in: scopedTransferIds } } : {}),
      },
    }),
  ]);
  return { disputes, failedPayments, failedRefunds: failedRefundCount, achReturns };
}

// ------------------------------------------------------ authorization meter

export type AuthStatus = "good" | "warning" | "critical" | "none";

export interface AuthMeter {
  status: AuthStatus;
  /** 0-100, null when there is no authorization data. */
  ratePercent: number | null;
  headline: string;
  caption: string;
}

/**
 * Plain-language read of the authorization rate. Thresholds are a product
 * judgement, not a processor standard: >= 85% healthy, 70-85% worth a look,
 * below 70% needs attention.
 */
export function describeAuthRate(succeeded: number, total: number): AuthMeter {
  if (total <= 0) {
    return {
      status: "none",
      ratePercent: null,
      headline: "No data yet",
      caption: "Approval rates appear after your first payment attempts.",
    };
  }
  const rate = (succeeded / total) * 100;
  const status: AuthStatus = rate >= 85 ? "good" : rate >= 70 ? "warning" : "critical";
  const headline = status === "good" ? "Healthy" : status === "warning" ? "Worth a look" : "Needs attention";
  return {
    status,
    ratePercent: rate,
    headline,
    caption: `${succeeded.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} payment attempts were approved.`,
  };
}
