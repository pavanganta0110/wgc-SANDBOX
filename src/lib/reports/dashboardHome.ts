import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatPersonName } from "@/lib/formatPersonName";

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

// ------------------------------------------------------------ top donors

export interface TopDonor {
  donorId: string;
  name: string;
  amountCents: number;
  gifts: number;
}

function scopeSql(attributedUserId?: string) {
  return attributedUserId ? Prisma.sql`AND p."attributedUserId" = ${attributedUserId}` : Prisma.empty;
}

/** Top donors by gross amount in the range: one grouped query with LIMIT, so
 * it never loads every payment. A donor who asked to be anonymous shows as
 * "Anonymous donor" (same preference the campaign wall honours). */
export async function getTopDonors(p: {
  churchId: string;
  attributedUserId?: string;
  dateFilter?: { gte: Date; lte?: Date };
  limit?: number;
}): Promise<TopDonor[]> {
  const { churchId, attributedUserId, dateFilter, limit = 5 } = p;
  const rows = await prisma.$queryRaw<
    { donor_id: string; name: string | null; anonymous: boolean | null; amt: bigint | number; gifts: bigint | number }[]
  >(Prisma.sql`
    SELECT p."donorId" AS donor_id, d.name, d."anonymousPreference" AS anonymous,
           SUM(COALESCE(t."amountCents", 0))::bigint AS amt, COUNT(*)::bigint AS gifts
    FROM "FinixTransfer" t
    JOIN "Payment" p ON p."finixTransferId" = t."finixTransferId" AND p."churchId" = t."churchId"
    JOIN "Donor" d ON d.id = p."donorId" AND d."churchId" = t."churchId"
    WHERE t."churchId" = ${churchId}
      AND UPPER(t.state) = 'SUCCEEDED'
      AND (t.subtype IS NULL OR t.subtype NOT LIKE '%SETTLEMENT%')
      ${dateFilter ? Prisma.sql`AND t."createdAtFinix" >= ${dateFilter.gte}` : Prisma.empty}
      ${dateFilter?.lte ? Prisma.sql`AND t."createdAtFinix" <= ${dateFilter.lte}` : Prisma.empty}
      ${scopeSql(attributedUserId)}
    GROUP BY p."donorId", d.name, d."anonymousPreference"
    ORDER BY amt DESC, p."donorId"
    LIMIT ${limit}
  `);
  return rows.map((r) => ({
    donorId: r.donor_id,
    name: r.anonymous ? "Anonymous donor" : formatPersonName(r.name),
    amountCents: Number(r.amt),
    gifts: Number(r.gifts),
  }));
}

/** Initials for an avatar: first letters of the first two words. */
export function initialsOf(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return words
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

// ---------------------------------------------------------- donor growth

export interface DonorGrowthBucket {
  label: string;
  newDonors: number;
  returningDonors: number;
}

/**
 * New vs returning donors per bucket. "New" = the donor's first successful
 * payment ever falls inside the bucket. Only donors active in the span are
 * looked up (indexed by donorId), never the whole payment table.
 */
export async function getDonorGrowth(p: {
  churchId: string;
  attributedUserId?: string;
  buckets: { start: Date; end: Date; label: string }[];
}): Promise<DonorGrowthBucket[]> {
  const { churchId, attributedUserId, buckets } = p;
  if (buckets.length === 0) return [];
  const starts = buckets.map((b) => b.start.toISOString());
  const ends = buckets.map((b) => b.end.toISOString());
  const rows = await prisma.$queryRaw<{ idx: bigint | number; new_donors: bigint | number; returning: bigint | number }[]>(Prisma.sql`
    WITH w AS (
      SELECT x.s, x.e, x.idx
      FROM unnest(${starts}::timestamptz[], ${ends}::timestamptz[]) WITH ORDINALITY AS x(s, e, idx)
    ),
    active AS (
      SELECT t."createdAtFinix" AS ts, p."donorId" AS donor_id
      FROM "FinixTransfer" t
      JOIN "Payment" p ON p."finixTransferId" = t."finixTransferId" AND p."churchId" = t."churchId"
      WHERE t."churchId" = ${churchId}
        AND UPPER(t.state) = 'SUCCEEDED'
        AND (t.subtype IS NULL OR t.subtype NOT LIKE '%SETTLEMENT%')
        AND p."donorId" IS NOT NULL
        AND t."createdAtFinix" >= (SELECT MIN(s) FROM w)
        AND t."createdAtFinix" < (SELECT MAX(e) FROM w)
        ${scopeSql(attributedUserId)}
    ),
    first_gift AS (
      SELECT p."donorId" AS donor_id, MIN(p."createdAt") AS first_at
      FROM "Payment" p
      WHERE p."churchId" = ${churchId}
        AND p.status = 'SUCCEEDED'
        AND p."donorId" IN (SELECT DISTINCT donor_id FROM active)
      GROUP BY p."donorId"
    )
    SELECT
      w.idx,
      COUNT(DISTINCT a.donor_id) FILTER (WHERE f.first_at >= w.s)::bigint AS new_donors,
      COUNT(DISTINCT a.donor_id) FILTER (WHERE f.first_at < w.s)::bigint AS returning
    FROM w
    LEFT JOIN active a ON a.ts >= w.s AND a.ts < w.e
    LEFT JOIN first_gift f ON f.donor_id = a.donor_id
    GROUP BY w.idx
    ORDER BY w.idx
  `);
  return buckets.map((b, i) => ({
    label: b.label,
    newDonors: Number(rows[i]?.new_donors ?? 0),
    returningDonors: Number(rows[i]?.returning ?? 0),
  }));
}

// -------------------------------------------------------- recent activity

export type ActivityType = "donation" | "registration" | "pledge";

export interface ActivityItem {
  id: string;
  type: ActivityType;
  /** "Guest donor" when unknown, "Anonymous donor" when they asked. */
  name: string;
  amountCents: number | null;
  at: Date;
  detail?: string;
  href: string;
}

export const ACTIVITY_LIMIT = 10;

/** Pure: merge the per-type lists newest-first and trim. */
export function mergeActivity(lists: ActivityItem[][], limit = ACTIVITY_LIMIT): ActivityItem[] {
  return lists
    .flat()
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, limit);
}

/** Latest donations, event registrations and pledges. Each source is its own
 * LIMITed query; nothing scans the full history. */
export async function getRecentActivity(p: {
  churchId: string;
  paymentScope: Prisma.PaymentWhereInput;
  /** Registrations carry no per-user attribution: organization scope only. */
  includeRegistrations: boolean;
  attributedUserId?: string;
}): Promise<ActivityItem[]> {
  const { churchId, paymentScope, includeRegistrations, attributedUserId } = p;
  const [payments, registrations, pledges] = await Promise.all([
    prisma.payment.findMany({
      where: { ...paymentScope, status: "SUCCEEDED" },
      orderBy: { createdAt: "desc" },
      take: ACTIVITY_LIMIT,
      select: { id: true, donorId: true, amountCents: true, createdAt: true, isAnonymous: true, fundName: true, finixTransferId: true },
    }),
    includeRegistrations
      ? prisma.eventRegistration.findMany({
          where: { churchId, status: "CONFIRMED" },
          orderBy: { confirmedAt: "desc" },
          take: ACTIVITY_LIMIT,
          select: {
            id: true,
            eventId: true,
            registrantFirstName: true,
            registrantLastName: true,
            totalCents: true,
            attendeeCount: true,
            confirmedAt: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
    prisma.pledge.findMany({
      where: { churchId, status: { not: "CANCELED" }, ...(attributedUserId ? { attributedUserId } : {}) },
      orderBy: { pledgedAt: "desc" },
      take: ACTIVITY_LIMIT,
      select: { id: true, pledgeCampaignId: true, donorId: true, isAnonymous: true, pledgeAmountCents: true, pledgedAt: true },
    }),
  ]);

  const donorIds = Array.from(
    new Set([...payments.map((x) => x.donorId), ...pledges.map((x) => x.donorId)].filter((v): v is string => !!v))
  );
  const donors = donorIds.length
    ? await prisma.donor.findMany({
        where: { churchId, id: { in: donorIds } },
        select: { id: true, name: true, anonymousPreference: true },
      })
    : [];
  const donorById = new Map(donors.map((d) => [d.id, d]));
  const nameFor = (donorId: string | null, isAnonymous: boolean) => {
    const d = donorId ? donorById.get(donorId) : undefined;
    if (isAnonymous || d?.anonymousPreference) return "Anonymous donor";
    return d?.name ? formatPersonName(d.name) : "Guest donor";
  };

  return mergeActivity([
    payments.map((x) => ({
      id: `payment:${x.id}`,
      type: "donation" as const,
      name: nameFor(x.donorId, x.isAnonymous),
      amountCents: x.amountCents,
      at: x.createdAt,
      detail: x.fundName ?? undefined,
      href: x.finixTransferId
        ? `/merchant/transactions/payments?id=${encodeURIComponent(x.finixTransferId)}`
        : "/merchant/transactions/payments",
    })),
    registrations.map((r) => ({
      id: `registration:${r.id}`,
      type: "registration" as const,
      name: `${r.registrantFirstName} ${r.registrantLastName}`.trim(),
      amountCents: r.totalCents > 0 ? r.totalCents : null,
      at: r.confirmedAt ?? r.createdAt,
      detail: `${r.attendeeCount} attendee${r.attendeeCount === 1 ? "" : "s"}`,
      href: `/merchant/events/${r.eventId}`,
    })),
    pledges.map((x) => ({
      id: `pledge:${x.id}`,
      type: "pledge" as const,
      name: nameFor(x.donorId, x.isAnonymous),
      amountCents: x.pledgeAmountCents,
      at: x.pledgedAt,
      href: `/merchant/pledge-campaigns/${x.pledgeCampaignId}`,
    })),
  ]);
}

/** "5m ago" / "3h ago" / "2d ago" / a date — pure, `now` injectable for tests. */
export function timeAgo(date: Date, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" });
}
