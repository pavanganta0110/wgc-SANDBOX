import { prisma } from "@/lib/prisma";
import { refreshSettlementAndDepositFromFinix } from "@/lib/finix/sync/settlementFundingSync";

export interface BackfillSummary {
  checked: number;
  updated: number;
  unchanged: number;
  failed: number;
  failures: { finixSettlementId: string; error: string }[];
}

const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_CONCURRENCY = 3;
const MAX_RETRIES = 3;

function isRetryableError(err: unknown): boolean {
  const status = (err as any)?.status;
  return status === 429 || (typeof status === "number" && status >= 500);
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryableError(err) || attempt === MAX_RETRIES) throw err;
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw lastErr;
}

/**
 * Finds settlements that are missing a resolvable status or a linked
 * merchant deposit, and re-syncs each directly from Finix. Paginated
 * (never loads every candidate row at once) and concurrency-limited (never
 * fires more than `concurrency` Finix requests at a time) — protects
 * against Finix rate limits on a church/org with a large settlement
 * history. Must be explicitly enabled via env var by the caller (see the
 * admin route) — this function itself has no guard, since it's also the
 * function focused tests exercise directly.
 */
export async function backfillSettlementDeposits(options?: { pageSize?: number; concurrency?: number }): Promise<BackfillSummary> {
  const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;
  const concurrency = options?.concurrency ?? DEFAULT_CONCURRENCY;

  const summary: BackfillSummary = { checked: 0, updated: 0, unchanged: 0, failed: 0, failures: [] };

  let cursor: string | undefined;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // Prisma has no direct "no related FinixFundingTransferAttempt row"
    // filter for this string-matched (non-FK) link, so every settlement is
    // paginated through and the "missing deposit" condition is checked
    // per-batch below, alongside the UNKNOWN/missing-status condition
    // that IS expressible directly.
    const candidates = await prisma.finixSettlement.findMany({
      where: { churchId: { not: null } },
      orderBy: { finixSettlementId: "asc" },
      take: pageSize,
      ...(cursor ? { cursor: { finixSettlementId: cursor }, skip: 1 } : {}),
    });

    if (candidates.length === 0) break;

    const settlementIds = candidates.map((s) => s.finixSettlementId);
    const existingDeposits = await prisma.finixFundingTransferAttempt.findMany({
      where: { finixSettlementId: { in: settlementIds } },
      select: { finixSettlementId: true },
    });
    const settlementIdsWithDeposit = new Set(existingDeposits.map((d) => d.finixSettlementId));

    const toProcess = candidates.filter(
      (s) => s.processorState == null || s.processorState === "UNKNOWN" || !settlementIdsWithDeposit.has(s.finixSettlementId),
    );

    for (let i = 0; i < toProcess.length; i += concurrency) {
      const batch = toProcess.slice(i, i + concurrency);
      const results = await Promise.allSettled(
        batch.map(async (settlement) => {
          const before = { processorState: settlement.processorState, hadDeposit: settlementIdsWithDeposit.has(settlement.finixSettlementId) };
          await withRetry(() =>
            refreshSettlementAndDepositFromFinix(settlement.finixSettlementId, settlement.churchId!, settlement.finixMerchantId),
          );
          const after = await prisma.finixSettlement.findUnique({ where: { finixSettlementId: settlement.finixSettlementId }, select: { processorState: true } });
          const afterHasDeposit = await prisma.finixFundingTransferAttempt.findFirst({
            where: { finixSettlementId: settlement.finixSettlementId },
            select: { id: true },
          });
          const changed = before.processorState !== after?.processorState || before.hadDeposit !== Boolean(afterHasDeposit);
          return { finixSettlementId: settlement.finixSettlementId, changed };
        }),
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        summary.checked++;
        if (result.status === "fulfilled") {
          if (result.value.changed) summary.updated++;
          else summary.unchanged++;
        } else {
          summary.failed++;
          summary.failures.push({
            finixSettlementId: batch[j].finixSettlementId,
            error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          });
        }
      }
    }

    cursor = candidates[candidates.length - 1]?.finixSettlementId;
    if (candidates.length < pageSize) break;
  }

  return summary;
}
