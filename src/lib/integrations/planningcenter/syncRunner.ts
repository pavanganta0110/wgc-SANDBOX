import { prisma } from "@/lib/prisma";
import { isPlanningCenterSyncEnabled } from "./config";
import { DEFAULT_TIME_BUDGET_MS, processSettlementSync, type EngineOptions, type SyncOutcome } from "./syncEngine";

/**
 * Finds the settled deposits that need work and hands them to the engine, one
 * at a time, inside a shared time budget. This layer only SELECTS; every
 * safety rule (claiming, scope, one-payment-one-donation) lives in the engine.
 */

/** A dry run looks back this far; a live run looks back to the go-live watermark. */
export const DRY_RUN_LOOKBACK_DAYS = 14;
const MAX_SETTLEMENTS_PER_CHURCH = 200;

export interface RunSummary {
  churchesChecked: number;
  settlementsProcessed: number;
  outcomes: Partial<Record<SyncOutcome, number>>;
  stoppedForTime: boolean;
}

const empty = (): RunSummary => ({ churchesChecked: 0, settlementsProcessed: 0, outcomes: {}, stoppedForTime: false });

function merge(into: RunSummary, from: RunSummary) {
  into.churchesChecked += from.churchesChecked;
  into.settlementsProcessed += from.settlementsProcessed;
  into.stoppedForTime = into.stoppedForTime || from.stoppedForTime;
  for (const [k, v] of Object.entries(from.outcomes)) into.outcomes[k as SyncOutcome] = (into.outcomes[k as SyncOutcome] ?? 0) + (v ?? 0);
}

/** Which already-recorded settlements still need the engine's attention. Cheap, DB-only. */
export function needsAttention(
  record: { status: string; commitStatus: string; nextAttemptAt: Date | null } | undefined,
  mode: "DRY_RUN" | "LIVE",
  autoCommit: boolean,
  now: Date
): boolean {
  if (!record) return true;
  switch (record.status) {
    case "SYNCED":
      return record.commitStatus === "COMMITTING" || (record.commitStatus === "NOT_COMMITTED" && autoCommit);
    case "CANCELLED":
    case "NEEDS_REVIEW":
    case "FAILED":
      return false; // a person acts on these
    case "DRY_RUN":
      return mode === "LIVE";
    case "RETRY_SCHEDULED":
    case "PARTIAL":
      return !record.nextAttemptAt || record.nextAttemptAt <= now;
    default:
      return true;
  }
}

export async function runSyncForChurch(
  churchId: string,
  options: EngineOptions & { deadlineMs?: number } = {}
): Promise<RunSummary> {
  const summary = empty();
  const now = options.now ?? (() => new Date());
  const config = await prisma.planningCenterSyncConfig.findUnique({ where: { churchId } });
  if (!config || (config.syncMode !== "DRY_RUN" && config.syncMode !== "LIVE")) return summary;
  const mode = config.syncMode as "DRY_RUN" | "LIVE";
  summary.churchesChecked = 1;

  const since =
    mode === "LIVE"
      ? config.enabledAt
      : new Date(now().getTime() - DRY_RUN_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  if (!since) return summary; // LIVE with no watermark: nothing is in scope

  const settlements = await prisma.finixSettlement.findMany({
    where: { churchId, state: "SETTLED", settledAt: { gte: since } },
    orderBy: { settledAt: "asc" },
    take: MAX_SETTLEMENTS_PER_CHURCH,
    select: { finixSettlementId: true },
  });
  if (settlements.length === 0) return summary;

  const records = await prisma.planningCenterSyncRecord.findMany({
    where: { churchId, syncVersion: config.syncVersion, settlementId: { in: settlements.map((s) => s.finixSettlementId) } },
    select: { settlementId: true, status: true, commitStatus: true, nextAttemptAt: true },
  });
  const byId = new Map(records.map((r) => [r.settlementId, r]));

  const deadline = options.deadlineMs ?? now().getTime() + (options.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS);
  for (const { finixSettlementId } of settlements) {
    if (!needsAttention(byId.get(finixSettlementId), mode, config.autoCommitBatches, now())) continue;
    const remaining = deadline - now().getTime();
    if (remaining <= 1000) {
      summary.stoppedForTime = true;
      break;
    }
    const outcome = await processSettlementSync(churchId, finixSettlementId, { ...options, timeBudgetMs: remaining });
    summary.settlementsProcessed++;
    summary.outcomes[outcome] = (summary.outcomes[outcome] ?? 0) + 1;
  }
  return summary;
}

/**
 * Every church that has gift sync switched on, sharing one time budget. The
 * starting church rotates with the clock so one large church can't starve the
 * others when the budget runs out. Does nothing unless the platform switch is on.
 */
export async function runSyncForAllChurches(options: EngineOptions = {}): Promise<RunSummary & { skipped?: string }> {
  const now = options.now ?? (() => new Date());
  if (!isPlanningCenterSyncEnabled()) return { ...empty(), skipped: "PLANNING_CENTER_SYNC_ENABLED is not set to true" };

  const configs = await prisma.planningCenterSyncConfig.findMany({
    where: { syncMode: { in: ["DRY_RUN", "LIVE"] } },
    select: { churchId: true },
    orderBy: { churchId: "asc" },
  });
  const connected = await prisma.planningCenterConnection.findMany({
    where: { churchId: { in: configs.map((c) => c.churchId) }, status: "CONNECTED" },
    select: { churchId: true },
  });
  const ok = new Set(connected.map((c) => c.churchId));
  const churches = configs.map((c) => c.churchId).filter((id) => ok.has(id));

  const summary = empty();
  if (churches.length === 0) return summary;

  const deadline = now().getTime() + (options.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS);
  // Rotates daily, so with one run a day every church gets a turn at the front of the queue.
  const start = Math.floor(now().getTime() / (24 * 60 * 60 * 1000)) % churches.length;
  for (let i = 0; i < churches.length; i++) {
    if (now().getTime() >= deadline - 1000) {
      summary.stoppedForTime = true;
      break;
    }
    const churchId = churches[(start + i) % churches.length];
    try {
      merge(summary, await runSyncForChurch(churchId, { ...options, deadlineMs: deadline }));
    } catch (err) {
      // One church's failure must never stop the others.
      console.error(`planning-center sync: church ${churchId} failed:`, err instanceof Error ? err.message : err);
      summary.outcomes.FAILED = (summary.outcomes.FAILED ?? 0) + 1;
    }
  }
  return summary;
}
