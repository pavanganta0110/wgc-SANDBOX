import { prisma } from "@/lib/prisma";
import { isPlanningCenterSyncEnabled } from "./config";
import { DEFAULT_TIME_BUDGET_MS, processDaySync, processSettlementSync, type EngineOptions, type SyncOutcome } from "./syncEngine";
import { DAY_PLAN_STATUSES, dateKeyOf, parseDayUnitKey } from "./giftPlan";
import { reverseChangedGifts } from "./syncReversals";
import { attachPendingPeople } from "./syncAttach";

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
  /** "Send as paid" sweep only: gifts reversed in Planning Center, and people attached to gifts sent without one. */
  reversed?: number;
  attached?: number;
}

const empty = (): RunSummary => ({ churchesChecked: 0, settlementsProcessed: 0, outcomes: {}, stoppedForTime: false });

function merge(into: RunSummary, from: RunSummary) {
  into.churchesChecked += from.churchesChecked;
  into.settlementsProcessed += from.settlementsProcessed;
  into.stoppedForTime = into.stoppedForTime || from.stoppedForTime;
  if (from.reversed) into.reversed = (into.reversed ?? 0) + from.reversed;
  if (from.attached) into.attached = (into.attached ?? 0) + from.attached;
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

  // "As soon as it's paid" churches are swept by day, not by settlement.
  if (config.sendTiming === "ON_PAYMENT") return sweepDays(churchId, config, mode, options, summary, now);

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

const DAY_SWEEP_LOOKBACK_DAYS = 90;
const MAX_PAYMENTS_PER_SWEEP = 5000;

/**
 * The safety net for "send as soon as it's paid". The trigger sends a gift within moments; this catches anything it
 * missed (a restart, a lost race, Planning Center being down) and finishes unfinished days. Then it checks for gifts
 * that were refunded/returned after sending and for gifts waiting for a person. Everything is idempotent.
 */
async function sweepDays(
  churchId: string,
  config: NonNullable<Awaited<ReturnType<typeof prisma.planningCenterSyncConfig.findUnique>>>,
  mode: "DRY_RUN" | "LIVE",
  options: EngineOptions & { deadlineMs?: number },
  summary: RunSummary,
  now: () => Date
): Promise<RunSummary> {
  const floor = new Date(now().getTime() - DAY_SWEEP_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const since = mode === "LIVE" ? config.enabledAt : new Date(now().getTime() - DRY_RUN_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  if (!since) return summary; // LIVE with no watermark: nothing is in scope
  const from = since > floor ? since : floor;

  // Days with a paid gift we haven't recorded (or one still waiting to be sent).
  const payments = await prisma.payment.findMany({
    where: { churchId, status: { in: DAY_PLAN_STATUSES }, createdAt: { gte: from } },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: "asc" },
    take: MAX_PAYMENTS_PER_SWEEP,
  });
  const days = new Set<string>();
  if (payments.length > 0) {
    const records = await prisma.planningCenterDonationRecord.findMany({
      where: { churchId, paymentId: { in: payments.map((p) => p.id) } },
      select: { paymentId: true, status: true },
    });
    const byPayment = new Map(records.map((r) => [r.paymentId, r.status]));
    for (const p of payments) {
      const status = byPayment.get(p.id);
      if (status === undefined || status === "PENDING" || status === "SENDING") days.add(dateKeyOf(p.createdAt));
    }
  }
  // Days already started but not finished (a retry that came due, a commit still settling, held gifts to re-check).
  const open = await prisma.planningCenterSyncRecord.findMany({
    where: { churchId, syncVersion: config.syncVersion, settlementId: { startsWith: "day:" }, status: { in: ["PENDING", "IN_PROGRESS", "RETRY_SCHEDULED", "BLOCKED", "BLOCKED_AWAITING_FEES", "PARTIAL", "SYNCED"] } },
    select: { settlementId: true, status: true, commitStatus: true, nextAttemptAt: true },
  });
  for (const r of open) {
    const key = parseDayUnitKey(r.settlementId);
    if (key && key >= dateKeyOf(from) && needsAttention(r, mode, config.autoCommitBatches, now())) days.add(key);
  }

  const deadline = options.deadlineMs ?? now().getTime() + (options.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS);
  for (const dateKey of [...days].sort()) {
    const remaining = deadline - now().getTime();
    if (remaining <= 1000) {
      summary.stoppedForTime = true;
      return summary;
    }
    const outcome = await processDaySync(churchId, dateKey, { ...options, timeBudgetMs: remaining });
    summary.settlementsProcessed++;
    summary.outcomes[outcome] = (summary.outcomes[outcome] ?? 0) + 1;
  }

  // Reversals and attaching people only matter when gifts are really being sent.
  if (mode === "LIVE") {
    try {
      const reversed = await reverseChangedGifts(churchId, { client: options.client, now });
      if (reversed.reversed) summary.reversed = reversed.reversed;
      const attached = await attachPendingPeople(churchId, { client: options.client });
      if (attached.attached) summary.attached = attached.attached;
    } catch (err) {
      // Not being able to reverse/attach this time (a sign-in problem, a rate limit) must not fail the whole sweep.
      console.error(`planning-center sweep: reversals/attach for church ${churchId}:`, err instanceof Error ? err.message : err);
    }
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
