import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { isPlanningCenterSyncEnabled } from "./config";
import { PlanningCenterConnectionError, PlanningCenterSetupError } from "./errors";
import { ensureSyncConfig, computeStoredGivingReadiness } from "./syncConfig";
import { runSyncForChurch, type RunSummary } from "./syncRunner";
import type { SyncSettingsInput } from "./syncTypes";

/**
 * What a church admin can do to gift sync: change its settings, retry a
 * failed deposit, resolve a flagged gift, or run a pass right now. Every one
 * is audit-logged, scoped to the church from the session, and conservative:
 * the engine remains the only thing that ever writes to Planning Center.
 */

export interface Actor {
  userId: string;
  email?: string | null;
  role?: string | null;
  req?: Request;
}

const MODES = ["OFF", "DRY_RUN", "LIVE"];
const POLICIES = ["HOLD_FOR_REVIEW", "CREATE_PERSON", "ANONYMOUS"];

async function audit(churchId: string, actor: Actor, action: string, entityType: string, entityId: string | undefined, metadata?: Record<string, unknown>) {
  await logDashboardAction({ churchId, actorUserId: actor.userId, actorEmail: actor.email, actorRole: actor.role, action, entityType, entityId, metadata, req: actor.req });
}

async function requireConnected(churchId: string) {
  const connection = await prisma.planningCenterConnection.findUnique({ where: { churchId } });
  if (!connection || connection.status !== "CONNECTED" || !connection.pcoOrganizationId) throw new PlanningCenterConnectionError("Connect Planning Center first.");
  return { connection, pcoOrganizationId: connection.pcoOrganizationId };
}

/**
 * Settings, with the gates that make going live deliberate:
 *  - sync can't be turned on until Giving setup is complete;
 *  - it can't be turned on at all while the platform switch is off;
 *  - LIVE requires at least one completed dry run;
 *  - the go-live watermark is set when sync first goes LIVE and cleared when
 *    sync is turned OFF, so re-enabling never back-posts a paused period.
 */
export async function updateSyncSettings(churchId: string, input: SyncSettingsInput, actor: Actor, now: Date = new Date()) {
  const { pcoOrganizationId } = await requireConnected(churchId);
  const config = await ensureSyncConfig(churchId, pcoOrganizationId);
  const data: Record<string, unknown> = {};

  if (input.unmatchedDonorPolicy !== undefined) {
    if (!POLICIES.includes(input.unmatchedDonorPolicy)) throw new PlanningCenterSetupError("Choose a valid option for donors who can't be matched.");
    data.unmatchedDonorPolicy = input.unmatchedDonorPolicy;
  }
  if (input.autoCommitBatches !== undefined) data.autoCommitBatches = Boolean(input.autoCommitBatches);

  if (input.syncMode !== undefined && input.syncMode !== config.syncMode) {
    if (!MODES.includes(input.syncMode)) throw new PlanningCenterSetupError("Choose a valid sync mode.");
    if (input.syncMode !== "OFF") {
      if (!isPlanningCenterSyncEnabled()) throw new PlanningCenterSetupError("Gift sync isn't available yet. WGC will let you know when it is.");
      const readiness = await computeStoredGivingReadiness(churchId);
      if (!readiness.ready) throw new PlanningCenterSetupError(`Finish the Giving setup first: ${readiness.reasons[0]}`);
    }
    if (input.syncMode === "LIVE") {
      const dryRuns = await prisma.planningCenterSyncAttempt.count({ where: { churchId, outcome: "DRY_RUN" } });
      if (dryRuns === 0) throw new PlanningCenterSetupError("Run a preview first. Turn on Preview, let it look at a recent deposit, check what it would send, then go live.");
    }
    data.syncMode = input.syncMode;
    if (input.syncMode === "OFF") data.enabledAt = null;
    else if (input.syncMode === "LIVE") data.enabledAt = config.syncMode === "OFF" ? now : config.enabledAt ?? now;
  }

  if (Object.keys(data).length === 0) return config;
  const updated = await prisma.planningCenterSyncConfig.update({ where: { churchId }, data });
  await audit(churchId, actor, "planningcenter.sync_settings_changed", "PlanningCenterSyncConfig", config.id, { ...data, enabledAt: undefined });
  return updated;
}

/** Re-opens a deposit that failed or was paused. NEEDS_REVIEW is deliberately not retryable here: its flagged gifts must be resolved first. */
export async function retrySyncRecord(churchId: string, recordId: string, actor: Actor) {
  const record = await prisma.planningCenterSyncRecord.findFirst({ where: { id: recordId, churchId } });
  if (!record) throw new PlanningCenterSetupError("That deposit wasn't found.");
  if (record.status === "NEEDS_REVIEW") throw new PlanningCenterSetupError("Some gifts in this deposit need your review first. Resolve them below, then it continues.");
  if (!["FAILED", "BLOCKED", "BLOCKED_AWAITING_FEES", "RETRY_SCHEDULED"].includes(record.status)) {
    throw new PlanningCenterSetupError("This deposit doesn't need a retry.");
  }

  // Gifts Planning Center definitely rejected are safe to send again once the cause is fixed.
  await prisma.planningCenterDonationRecord.updateMany({ where: { syncRecordId: record.id, status: "FAILED" }, data: { status: "PENDING", lastErrorCode: null, lastErrorMessage: null } });
  await prisma.planningCenterSyncRecord.update({
    where: { id: record.id },
    data: { status: "PENDING", attemptCount: 0, nextAttemptAt: null, lastErrorCode: null, lastErrorMessage: null, blockedReason: null, requiresManualReview: false, lastNotifiedStatus: null },
  });
  await audit(churchId, actor, "planningcenter.sync_retried", "PlanningCenterSyncRecord", record.id, { settlementId: record.settlementId });
}

/**
 * Resolves a gift WGC couldn't confirm. RETRY means the church checked Planning
 * Center and the gift is NOT there; SKIP means they don't want it sent. Either
 * way the church's decision and identity are audit-logged.
 */
export async function resolveDonationRecord(churchId: string, donationId: string, action: "RETRY" | "SKIP", actor: Actor) {
  const donation = await prisma.planningCenterDonationRecord.findFirst({ where: { id: donationId, churchId } });
  if (!donation) throw new PlanningCenterSetupError("That gift wasn't found.");
  if (donation.status !== "NEEDS_REVIEW") throw new PlanningCenterSetupError("That gift doesn't need a decision.");
  if (action !== "RETRY" && action !== "SKIP") throw new PlanningCenterSetupError("Choose what to do with this gift.");

  await prisma.planningCenterDonationRecord.update({
    where: { id: donation.id },
    data:
      action === "RETRY"
        ? { status: "PENDING", lastErrorCode: null, lastErrorMessage: null, sendingStartedAt: null }
        : { status: "SKIPPED", skippedReason: "MANUAL", lastErrorCode: null, lastErrorMessage: null, sendingStartedAt: null },
  });

  // Once nothing in the deposit is waiting on a person, let it continue.
  const remaining = await prisma.planningCenterDonationRecord.count({ where: { syncRecordId: donation.syncRecordId, status: "NEEDS_REVIEW" } });
  if (remaining === 0) {
    await prisma.planningCenterSyncRecord.updateMany({
      where: { id: donation.syncRecordId, churchId, status: "NEEDS_REVIEW" },
      data: { status: "PENDING", attemptCount: 0, nextAttemptAt: null, requiresManualReview: false, lastNotifiedStatus: null, lastErrorMessage: null },
    });
  }
  await audit(churchId, actor, action === "RETRY" ? "planningcenter.gift_retry_confirmed" : "planningcenter.gift_skipped", "PlanningCenterDonationRecord", donation.id, { paymentId: donation.paymentId });
}

/** "Sync now": one bounded pass for this church. Safe alongside the cron — the engine claims each deposit. */
export async function syncNow(churchId: string, actor: Actor, options: { recomputeDryRun?: boolean; timeBudgetMs?: number } = {}): Promise<RunSummary> {
  await requireConnected(churchId);
  if (!isPlanningCenterSyncEnabled()) throw new PlanningCenterSetupError("Gift sync isn't available yet.");
  const summary = await runSyncForChurch(churchId, { timeBudgetMs: options.timeBudgetMs ?? 25_000, recomputeDryRun: options.recomputeDryRun });
  await audit(churchId, actor, "planningcenter.sync_now", "PlanningCenterSyncConfig", undefined, { processed: summary.settlementsProcessed });
  return summary;
}
