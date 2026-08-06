import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Dashboard summary tiles and trend charts must never fetch every matching
 * transaction row and reduce them in JavaScript — that pattern (findMany
 * with no `take`, then .filter()/.reduce() in Node) works fine against a
 * test database but degrades linearly as an organization's real transaction
 * history grows, and eventually makes the dashboard visibly slow to load.
 * Every function here does the summing/counting in Postgres instead, using
 * the existing (churchId, createdAtFinix) indexes — see
 * src/lib/reports/__tests__/dashboardAggregates.test.ts for the regression
 * test that guards against this creeping back in.
 */

export interface TransferAggregate {
  totalCount: number;
  succeededCount: number;
  succeededVolumeCents: number;
}

export async function aggregateTransfers(
  where: Prisma.FinixTransferWhereInput
): Promise<TransferAggregate> {
  const [totalCount, succeeded] = await Promise.all([
    prisma.finixTransfer.count({ where }),
    prisma.finixTransfer.aggregate({
      where: { ...where, state: { equals: "SUCCEEDED", mode: "insensitive" } },
      _count: { _all: true },
      _sum: { amountCents: true },
    }),
  ]);
  return {
    totalCount,
    succeededCount: succeeded._count._all,
    succeededVolumeCents: succeeded._sum.amountCents ?? 0,
  };
}

export interface DisputeAggregate {
  totalCount: number;
  activeCount: number;
  totalVolumeCents: number;
}

export async function aggregateDisputes(
  where: Prisma.FinixDisputeWhereInput
): Promise<DisputeAggregate> {
  const [total, activeCount] = await Promise.all([
    prisma.finixDispute.aggregate({
      where,
      _count: { _all: true },
      _sum: { amountCents: true },
    }),
    prisma.finixDispute.count({
      where: { ...where, state: { equals: "pending", mode: "insensitive" } },
    }),
  ]);
  return {
    totalCount: total._count._all,
    totalVolumeCents: total._sum.amountCents ?? 0,
    activeCount,
  };
}

export interface RefundAggregate {
  totalCount: number;
  totalVolumeCents: number;
  succeededCount: number;
  succeededVolumeCents: number;
  failedCount: number;
  failedVolumeCents: number;
}

export async function aggregateRefunds(
  where: Prisma.FinixRefundOrReversalWhereInput
): Promise<RefundAggregate> {
  const [total, succeeded, failed] = await Promise.all([
    prisma.finixRefundOrReversal.aggregate({
      where,
      _count: { _all: true },
      _sum: { amountCents: true },
    }),
    prisma.finixRefundOrReversal.aggregate({
      where: { ...where, state: { equals: "SUCCEEDED", mode: "insensitive" } },
      _count: { _all: true },
      _sum: { amountCents: true },
    }),
    prisma.finixRefundOrReversal.aggregate({
      where: { ...where, state: { equals: "FAILED", mode: "insensitive" } },
      _count: { _all: true },
      _sum: { amountCents: true },
    }),
  ]);
  return {
    totalCount: total._count._all,
    totalVolumeCents: total._sum.amountCents ?? 0,
    succeededCount: succeeded._count._all,
    succeededVolumeCents: succeeded._sum.amountCents ?? 0,
    failedCount: failed._count._all,
    failedVolumeCents: failed._sum.amountCents ?? 0,
  };
}

export interface AuthorizationAggregate {
  totalCount: number;
  succeededCount: number;
  requestedVolumeCents: number;
  voidedCount: number;
  voidedVolumeCents: number;
}

export async function aggregateAuthorizations(
  where: Prisma.FinixAuthorizationWhereInput
): Promise<AuthorizationAggregate> {
  const [total, succeededCount, voided] = await Promise.all([
    prisma.finixAuthorization.aggregate({
      where,
      _count: { _all: true },
      _sum: { amountRequestedCents: true },
    }),
    prisma.finixAuthorization.count({
      where: { ...where, state: { equals: "SUCCEEDED", mode: "insensitive" } },
    }),
    prisma.finixAuthorization.aggregate({
      where: { ...where, isVoid: true },
      _count: { _all: true },
      _sum: { amountCents: true },
    }),
  ]);
  return {
    totalCount: total._count._all,
    requestedVolumeCents: total._sum.amountRequestedCents ?? 0,
    succeededCount,
    voidedCount: voided._count._all,
    voidedVolumeCents: voided._sum.amountCents ?? 0,
  };
}

export interface DepositAggregate {
  totalVolumeCents: number;
}

export async function aggregateDeposits(
  where: Prisma.FinixFundingTransferAttemptWhereInput
): Promise<DepositAggregate> {
  const total = await prisma.finixFundingTransferAttempt.aggregate({
    where,
    _sum: { amountCents: true },
  });
  return { totalVolumeCents: total._sum.amountCents ?? 0 };
}

export interface TrendBucket {
  start: Date;
  end: Date;
  label: string;
}

/**
 * Sums a table's amountCents into each of the given (already-computed, e.g.
 * Central-time-correct) bucket windows using one small indexed aggregate
 * query per bucket, run in parallel — never a full-table fetch. Bucket
 * counts are always small (≤14 in this app), so this stays a bounded number
 * of cheap queries regardless of how many rows the organization has.
 */
async function sumByBuckets<Where>(
  aggregate: (where: Where & { createdAtFinix: { gte: Date; lt: Date } }) => Promise<number | null>,
  baseWhere: Where,
  buckets: TrendBucket[]
): Promise<number[]> {
  const sums = await Promise.all(
    buckets.map((b) =>
      aggregate({ ...baseWhere, createdAtFinix: { gte: b.start, lt: b.end } })
    )
  );
  return sums.map((cents) => (cents ?? 0) / 100);
}

export function getTransferVolumeTrend(
  where: Prisma.FinixTransferWhereInput,
  buckets: TrendBucket[]
): Promise<number[]> {
  return sumByBuckets(
    async (w) => {
      const result = await prisma.finixTransfer.aggregate({
        where: { ...w, state: { equals: "SUCCEEDED", mode: "insensitive" } },
        _sum: { amountCents: true },
      });
      return result._sum.amountCents;
    },
    where,
    buckets
  );
}

export function getSettlementTrend(
  where: Prisma.FinixSettlementWhereInput,
  buckets: TrendBucket[]
): Promise<number[]> {
  return sumByBuckets(
    async (w) => {
      const result = await prisma.finixSettlement.aggregate({
        where: w,
        _sum: { totalAmountCents: true },
      });
      return result._sum.totalAmountCents;
    },
    where,
    buckets
  );
}

export function getDepositTrend(
  where: Prisma.FinixFundingTransferAttemptWhereInput,
  buckets: TrendBucket[]
): Promise<number[]> {
  return sumByBuckets(
    async (w) => {
      const result = await prisma.finixFundingTransferAttempt.aggregate({
        where: w,
        _sum: { amountCents: true },
      });
      return result._sum.amountCents;
    },
    where,
    buckets
  );
}
