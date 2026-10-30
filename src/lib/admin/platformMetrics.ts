/**
 * Platform-wide (all merchants) processing metrics for the WGC admin
 * dashboard. Read-only. Source of truth is FinixTransfer — Finix's own
 * record of every charge, so donations, invoices and event registrations
 * are all counted, not just WGC `Payment` rows.
 *
 * Every number is summed/counted in Postgres (see dashboardAggregates.ts
 * for why we never reduce whole transfer tables in Node).
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ADMIN_RANGES, ADMIN_RANGE_LABEL, type AdminRange } from "./rangeOptions";

export { ADMIN_RANGES, ADMIN_RANGE_LABEL, type AdminRange };

export interface AdminPeriod {
  range: AdminRange;
  label: string;
  /** Null for "all time". */
  from: Date | null;
  to: Date;
  /** The equal-length period right before this one; null for "all time". */
  previous: { from: Date; to: Date } | null;
  comparisonLabel: string;
}

export function parseAdminRange(value: string | undefined): AdminRange {
  return ADMIN_RANGES.includes(value as AdminRange) ? (value as AdminRange) : "ytd";
}

export function resolveAdminPeriod(range: AdminRange, now: Date): AdminPeriod {
  const to = now;
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
  let from: Date | null;
  let previous: AdminPeriod["previous"];
  let comparisonLabel: string;
  switch (range) {
    case "30d":
      from = daysAgo(30);
      previous = { from: daysAgo(60), to: from };
      comparisonLabel = "prior 30 days";
      break;
    case "90d":
      from = daysAgo(90);
      previous = { from: daysAgo(180), to: from };
      comparisonLabel = "prior 90 days";
      break;
    case "12m":
      from = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      previous = { from: new Date(now.getFullYear() - 2, now.getMonth(), now.getDate()), to: from };
      comparisonLabel = "prior 12 months";
      break;
    case "ytd": {
      const y = now.getFullYear();
      from = new Date(y, 0, 1);
      // Same calendar window last year, so YTD compares like with like.
      previous = { from: new Date(y - 1, 0, 1), to: new Date(y - 1, now.getMonth(), now.getDate(), now.getHours()) };
      comparisonLabel = `same period ${y - 1}`;
      break;
    }
    case "all":
      from = null;
      previous = null;
      comparisonLabel = "";
      break;
  }
  return { range, label: ADMIN_RANGE_LABEL[range], from, to, previous, comparisonLabel };
}

export type MethodKey = "CARD" | "ACH" | "OTHER";
export type CardTypeKey = "CREDIT" | "DEBIT" | "PREPAID" | "UNKNOWN";

export interface VolumeSlice {
  amountCents: number;
  count: number;
}

export interface PlatformMetrics {
  merchants: { active: number; total: number; terminated: number; newInPeriod: number; processingInPeriod: number };
  processed: VolumeSlice;
  previousProcessedCents: number | null;
  refundsCents: number;
  returnsCents: number;
  byMethod: Record<MethodKey, VolumeSlice>;
  byCardType: Record<CardTypeKey, VolumeSlice>;
  /** Last 12 calendar months, oldest first, regardless of the selected range. */
  monthly: { month: string; cardCents: number; achCents: number; otherCents: number; count: number }[];
  topMerchants: { churchId: string; name: string; amountCents: number; count: number }[];
}

/**
 * A successful charge: excludes Finix's own settlement/payout rows and ACH
 * return rows (same exclusions the merchant Payments list uses).
 */
export const SUCCESSFUL_CHARGE_WHERE = Prisma.sql`
  UPPER(ft."state") = 'SUCCEEDED'
  AND (ft."subtype" IS NULL OR (ft."subtype" NOT ILIKE '%SETTLEMENT%' AND ft."subtype" NOT ILIKE '%RETURN%'))
  AND (ft."type" IS NULL OR UPPER(ft."type") <> 'REVERSAL')
`;

/**
 * An organization that exists in this database. Partner stats read only organizations
 * already linked to a partner, so this holds for them; kept for parity with the main
 * repository's platform metrics.
 */
const CHARGE_WHERE = SUCCESSFUL_CHARGE_WHERE;

export const ATTRIBUTED_WHERE = Prisma.sql`
  EXISTS (SELECT 1 FROM "Church" c_attr WHERE c_attr."id" = ft."churchId")
`;

export function inRange(column: Prisma.Sql, from: Date | null, to: Date): Prisma.Sql {
  return from ? Prisma.sql`${column} >= ${from} AND ${column} < ${to}` : Prisma.sql`${column} < ${to}`;
}

/**
 * Method comes from the payment-instrument snapshot; when that hasn't
 * synced yet, falls back to the WGC Payment row's own method.
 */
export const METHOD_SQL = Prisma.sql`
  CASE
    WHEN UPPER(COALESCE(pi."paymentMethodType", p."paymentMethodType", '')) = 'BANK_ACCOUNT' THEN 'ACH'
    WHEN COALESCE(pi."paymentMethodType", p."paymentMethodType") IS NULL THEN 'OTHER'
    ELSE 'CARD'
  END
`;

export const JOINS = Prisma.sql`
  LEFT JOIN "FinixPaymentInstrumentSnapshot" pi ON pi."finixPaymentInstrumentId" = ft."finixPaymentInstrumentId"
  LEFT JOIN LATERAL (
    SELECT p0."paymentMethodType" FROM "Payment" p0 WHERE p0."finixTransferId" = ft."finixTransferId" LIMIT 1
  ) p ON TRUE
`;

const n = (v: bigint | number | null | undefined) => Number(v ?? 0);

export async function loadPlatformMetrics(period: AdminPeriod): Promise<PlatformMetrics> {
  const created = Prisma.sql`ft."createdAtFinix"`;
  const now = period.to;
  // Months are bucketed in UTC by Postgres, so build the buckets in UTC too.
  const trendFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));

  const [breakdown, previousTotal, monthly, top, processing, refunds, returns, active, total, terminated, newInPeriod] =
    await Promise.all([
      prisma.$queryRaw<{ method: MethodKey; card_type: string | null; amount: bigint | null; count: bigint }[]>`
        SELECT ${METHOD_SQL} AS method,
               UPPER(pi."cardType") AS card_type,
               SUM(ft."amountCents") AS amount,
               COUNT(*) AS count
        FROM "FinixTransfer" ft
        ${JOINS}
        WHERE ${CHARGE_WHERE} AND ${inRange(created, period.from, period.to)}
        GROUP BY 1, 2
      `,
      period.previous
        ? prisma.$queryRaw<{ amount: bigint | null }[]>`
            SELECT SUM(ft."amountCents") AS amount
            FROM "FinixTransfer" ft
            WHERE ${CHARGE_WHERE} AND ${inRange(created, period.previous.from, period.previous.to)}
          `
        : Promise.resolve(null),
      prisma.$queryRaw<{ month: Date; method: MethodKey; amount: bigint | null; count: bigint }[]>`
        SELECT date_trunc('month', ft."createdAtFinix") AS month,
               ${METHOD_SQL} AS method,
               SUM(ft."amountCents") AS amount,
               COUNT(*) AS count
        FROM "FinixTransfer" ft
        ${JOINS}
        WHERE ${CHARGE_WHERE} AND ${inRange(created, trendFrom, now)}
        GROUP BY 1, 2
      `,
      prisma.$queryRaw<{ church_id: string; name: string | null; amount: bigint | null; count: bigint }[]>`
        SELECT ft."churchId" AS church_id, c."name" AS name, SUM(ft."amountCents") AS amount, COUNT(*) AS count
        FROM "FinixTransfer" ft
        LEFT JOIN "Church" c ON c."id" = ft."churchId"
        WHERE ${CHARGE_WHERE} AND ft."churchId" IS NOT NULL AND ${inRange(created, period.from, period.to)}
        GROUP BY ft."churchId", c."name"
        ORDER BY amount DESC NULLS LAST
        LIMIT 8
      `,
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(DISTINCT ft."churchId") AS count
        FROM "FinixTransfer" ft
        WHERE ${CHARGE_WHERE} AND ${inRange(created, period.from, period.to)}
      `,
      prisma.finixRefundOrReversal.aggregate({
        where: {
          state: { equals: "SUCCEEDED", mode: "insensitive" },
          createdAtFinix: period.from ? { gte: period.from, lt: period.to } : { lt: period.to },
        },
        _sum: { amountCents: true },
      }),
      prisma.bankReturn.aggregate({
        where: { createdAtFinix: period.from ? { gte: period.from, lt: period.to } : { lt: period.to } },
        _sum: { amountCents: true },
      }),
      prisma.church.count({ where: { status: "ACTIVE", finixMerchantId: { not: null } } }),
      prisma.church.count(),
      prisma.church.count({ where: { status: "TERMINATED" } }),
      prisma.church.count({ where: period.from ? { createdAt: { gte: period.from, lt: period.to } } : {} }),
    ]);

  const empty = (): VolumeSlice => ({ amountCents: 0, count: 0 });
  const byMethod: Record<MethodKey, VolumeSlice> = { CARD: empty(), ACH: empty(), OTHER: empty() };
  const byCardType: Record<CardTypeKey, VolumeSlice> = { CREDIT: empty(), DEBIT: empty(), PREPAID: empty(), UNKNOWN: empty() };
  for (const row of breakdown) {
    const amount = n(row.amount);
    const count = n(row.count);
    byMethod[row.method].amountCents += amount;
    byMethod[row.method].count += count;
    if (row.method === "CARD") {
      const key: CardTypeKey =
        row.card_type === "CREDIT" || row.card_type === "DEBIT" || row.card_type === "PREPAID" ? row.card_type : "UNKNOWN";
      byCardType[key].amountCents += amount;
      byCardType[key].count += count;
    }
  }
  const processed = Object.values(byMethod).reduce(
    (s, v) => ({ amountCents: s.amountCents + v.amountCents, count: s.count + v.count }),
    empty(),
  );

  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(trendFrom.getUTCFullYear(), trendFrom.getUTCMonth() + i, 1));
    return { key: `${d.getUTCFullYear()}-${d.getUTCMonth()}`, month: d.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }), cardCents: 0, achCents: 0, otherCents: 0, count: 0 };
  });
  const monthIndex = new Map(months.map((m, i) => [m.key, i]));
  for (const row of monthly) {
    const d = new Date(row.month);
    const i = monthIndex.get(`${d.getUTCFullYear()}-${d.getUTCMonth()}`);
    if (i === undefined) continue;
    const amount = n(row.amount);
    if (row.method === "CARD") months[i].cardCents += amount;
    else if (row.method === "ACH") months[i].achCents += amount;
    else months[i].otherCents += amount;
    months[i].count += n(row.count);
  }

  return {
    merchants: {
      active,
      total,
      terminated,
      newInPeriod,
      processingInPeriod: n(processing[0]?.count),
    },
    processed,
    previousProcessedCents: previousTotal ? n(previousTotal[0]?.amount) : null,
    refundsCents: refunds._sum.amountCents ?? 0,
    returnsCents: returns._sum.amountCents ?? 0,
    byMethod,
    byCardType,
    monthly: months.map((m) => ({ month: m.month, cardCents: m.cardCents, achCents: m.achCents, otherCents: m.otherCents, count: m.count })),
    topMerchants: top.map((t) => ({ churchId: t.church_id, name: t.name ?? "Unknown merchant", amountCents: n(t.amount), count: n(t.count) })),
  };
}
