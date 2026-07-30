import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { buildSettlementContributions } from "./contributionBuilder";
import { postAplosContribution, AplosContributionPostError } from "./contributionsClient";
import { getReadyConnectionToken, AplosConnectionNotReadyError } from "./resourceService";
import { computeNextAttemptAt, MAX_AUTOMATIC_RETRY_ATTEMPTS } from "./retryPolicy";
import { APLOS_AUDIT_EVENTS } from "./auditEvents";

/**
 * AplosSettlementSyncService — orchestrates one settlement's sync attempt,
 * per the architecture in docs/integrations/aplos.md section 1 and the
 * mandatory ambiguous-result policy in section 7. Every state transition
 * below maps directly onto AplosSyncRecord.status as documented in
 * prisma/schema.prisma.
 *
 * DOCUMENTED DESIGN DECISION — multi-contribution settlements and
 * retry-safety:
 *
 * contributionBuilder.ts can produce more than one Contribution payload for
 * a single settlement (one per distinct original-donation date — see its
 * own header comment). Aplos's Contributions API has no idempotency field,
 * so if contribution A of a settlement is confirmed created and contribution
 * B then fails with a plain (non-ambiguous) retryable error, a naive retry
 * of "the whole settlement" would re-POST contribution A and create a real
 * duplicate in Aplos. To prevent this, AplosSyncRecord.aplosContributionId
 * stores a JSON array of `{ payloadHash, aplosContributionId }` for every
 * contribution CONFIRMED created so far (never for an ambiguous outcome).
 * Every attempt re-derives the settlement's contributions, skips any whose
 * payloadHash is already in that confirmed list, and only posts the rest.
 * This is a WGC-side bookkeeping decision to satisfy Aplos's own
 * no-idempotency constraint — not a guess about any Aplos-documented
 * behavior.
 *
 * A PROCESSING record whose lastAttemptAt is older than
 * STALE_PROCESSING_MS is treated as an interrupted attempt of unknown
 * outcome and frozen into NEEDS_REVIEW, exactly like an ambiguous Aplos
 * timeout — never silently resumed or auto-retried. This is the same
 * "when in doubt, don't retry a possible in-flight write" principle Aplos's
 * own documented limitation forces for a single POST, applied consistently
 * to a process-level interruption.
 */

const STALE_PROCESSING_MS = 15 * 60 * 1000; // 15 minutes

interface ConfirmedContribution {
  payloadHash: string;
  aplosContributionId: string;
}

export type SyncSettlementOutcome =
  | "SYNCED"
  | "ALREADY_SYNCED"
  | "BLOCKED"
  | "BLOCKED_AWAITING_FEES"
  | "FAILED"
  | "RETRY_SCHEDULED"
  | "NEEDS_REVIEW"
  | "SKIPPED_LOCKED"
  | "SKIPPED_NOT_DUE";

export interface SyncSettlementResult {
  outcome: SyncSettlementOutcome;
  syncRecordId: string;
  safeMessage: string;
}

function parseConfirmed(raw: string | null): ConfirmedContribution[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is ConfirmedContribution => !!v && typeof v.payloadHash === "string" && typeof v.aplosContributionId === "string"
    );
  } catch {
    // A record written before this bookkeeping format existed, or any
    // other unparseable value, is treated as "nothing confirmed yet" —
    // safe (re-posts everything) rather than throwing, since this is a
    // read of our own prior write, not Aplos data.
    return [];
  }
}

/**
 * Finds or creates the AplosSyncRecord for this settlement at the
 * connection's current syncVersion, and attempts to move it into
 * PROCESSING. Returns null if it could not be claimed (already synced,
 * already locked by another run, in NEEDS_REVIEW, or not yet due for
 * retry) along with the reason.
 */
async function claimSyncRecord(
  churchId: string,
  finixSettlementId: string,
  syncVersion: number
): Promise<{ record: { id: string; attemptCount: number }; claimed: true } | { result: SyncSettlementResult; claimed: false }> {
  let record = await prisma.aplosSyncRecord.findUnique({
    where: { churchId_settlementId_syncVersion: { churchId, settlementId: finixSettlementId, syncVersion } },
  });

  if (!record) {
    record = await prisma.aplosSyncRecord.create({
      data: { churchId, sourceType: "FINIX_SETTLEMENT", sourceId: finixSettlementId, settlementId: finixSettlementId, syncVersion, status: "PENDING" },
    });
  }

  if (record.status === "SYNCED") {
    return { claimed: false, result: { outcome: "ALREADY_SYNCED", syncRecordId: record.id, safeMessage: "This settlement has already been synchronized to Aplos." } };
  }
  if (record.status === "NEEDS_REVIEW") {
    return { claimed: false, result: { outcome: "NEEDS_REVIEW", syncRecordId: record.id, safeMessage: "This settlement requires manual review before it can be retried." } };
  }
  if (record.status === "CANCELLED") {
    return { claimed: false, result: { outcome: "SKIPPED_LOCKED", syncRecordId: record.id, safeMessage: "This settlement's sync was cancelled." } };
  }
  if (record.status === "PROCESSING") {
    const isStale = !record.lastAttemptAt || Date.now() - record.lastAttemptAt.getTime() > STALE_PROCESSING_MS;
    if (!isStale) {
      return { claimed: false, result: { outcome: "SKIPPED_LOCKED", syncRecordId: record.id, safeMessage: "A sync attempt for this settlement is already in progress." } };
    }
    // Interrupted attempt of unknown outcome — freeze, never resume.
    await prisma.aplosSyncRecord.update({
      where: { id: record.id },
      data: {
        status: "NEEDS_REVIEW",
        requiresManualReview: true,
        blockedReason: "A previous sync attempt was interrupted and its outcome with Aplos could not be confirmed. A WGC administrator must verify in Aplos before this settlement can be retried.",
      },
    });
    await logDashboardAction({
      churchId,
      action: APLOS_AUDIT_EVENTS.SYNC_NEEDS_REVIEW,
      entityType: "AplosSyncRecord",
      entityId: record.id,
      metadata: { reason: "STALE_PROCESSING", settlementId: finixSettlementId },
    });
    return {
      claimed: false,
      result: { outcome: "NEEDS_REVIEW", syncRecordId: record.id, safeMessage: "A previous sync attempt was interrupted and requires manual review." },
    };
  }
  if (record.status === "RETRY_SCHEDULED" && record.nextAttemptAt && record.nextAttemptAt.getTime() > Date.now()) {
    return { claimed: false, result: { outcome: "SKIPPED_NOT_DUE", syncRecordId: record.id, safeMessage: "This settlement is scheduled for a later retry attempt." } };
  }
  // BLOCKED and FAILED are terminal for the automatic cron path — a
  // merchant/admin must act (fix mapping, reconnect, or press Retry) before
  // either is eligible again. Checked explicitly (rather than relying on
  // the lock query below to simply not match) so the cron reports an
  // accurate outcome instead of a misleading "claimed by a concurrent
  // attempt" message.
  if (record.status === "BLOCKED") {
    return { claimed: false, result: { outcome: "BLOCKED", syncRecordId: record.id, safeMessage: record.blockedReason ?? "This settlement is blocked and requires action before it can be synchronized." } };
  }
  if (record.status === "FAILED") {
    return { claimed: false, result: { outcome: "FAILED", syncRecordId: record.id, safeMessage: "This settlement failed to synchronize and requires a manual retry." } };
  }

  // Conditional lock: only succeeds if the record is still in one of the
  // states we just inspected — protects against a concurrent claim between
  // the read above and this write.
  const locked = await prisma.aplosSyncRecord.updateMany({
    where: { id: record.id, status: { in: ["PENDING", "RETRY_SCHEDULED", "BLOCKED_AWAITING_FEES"] } },
    data: { status: "PROCESSING", startedAt: record.startedAt ?? new Date(), lastAttemptAt: new Date() },
  });
  if (locked.count !== 1) {
    return { claimed: false, result: { outcome: "SKIPPED_LOCKED", syncRecordId: record.id, safeMessage: "This settlement was claimed by a concurrent sync attempt." } };
  }

  await logDashboardAction({ churchId, action: APLOS_AUDIT_EVENTS.SYNC_STARTED, entityType: "AplosSyncRecord", entityId: record.id, metadata: { settlementId: finixSettlementId } });
  return { claimed: true, record: { id: record.id, attemptCount: record.attemptCount } };
}

export async function processSettlement(churchId: string, finixSettlementId: string): Promise<SyncSettlementResult> {
  const connection = await prisma.aplosConnection.findUnique({ where: { churchId }, select: { syncVersion: true } });
  if (!connection) {
    throw new Error(`processSettlement called for church ${churchId} with no AplosConnection row.`);
  }

  const claim = await claimSyncRecord(churchId, finixSettlementId, connection.syncVersion);
  if (!claim.claimed) return claim.result;
  const { id: syncRecordId, attemptCount: attemptCountBefore } = claim.record;

  const build = await buildSettlementContributions(finixSettlementId, churchId);

  if (!build.eligible) {
    const status = build.awaitingFees ? "BLOCKED_AWAITING_FEES" : "BLOCKED";
    await prisma.aplosSyncRecord.update({
      where: { id: syncRecordId },
      data: { status, blockedReason: build.safeMessage, lastAttemptAt: new Date() },
    });
    await logDashboardAction({
      churchId,
      action: APLOS_AUDIT_EVENTS.SYNC_BLOCKED,
      entityType: "AplosSyncRecord",
      entityId: syncRecordId,
      metadata: { settlementId: finixSettlementId, reasons: build.reasons, awaitingFees: build.awaitingFees },
    });
    return { outcome: status, syncRecordId, safeMessage: build.safeMessage };
  }

  const record = await prisma.aplosSyncRecord.findUniqueOrThrow({ where: { id: syncRecordId }, select: { aplosContributionId: true } });
  const confirmed = parseConfirmed(record.aplosContributionId);
  const confirmedHashes = new Set(confirmed.map((c) => c.payloadHash));
  const remaining = build.contributions.filter((c) => !confirmedHashes.has(c.payloadHash));

  if (remaining.length === 0) {
    // Every contribution for this settlement was already confirmed created
    // on a prior attempt (e.g. we crashed after Aplos confirmed success but
    // before this record was marked SYNCED) — nothing left to POST.
    return finalizeSynced(churchId, syncRecordId, finixSettlementId, confirmed);
  }

  let token: string, aplosAccountId: string;
  try {
    ({ token, aplosAccountId } = await getReadyConnectionToken(churchId));
  } catch (err) {
    const message = err instanceof AplosConnectionNotReadyError ? err.message : "Unable to obtain an Aplos access token.";
    await prisma.aplosSyncRecord.update({ where: { id: syncRecordId }, data: { status: "BLOCKED", blockedReason: message, lastAttemptAt: new Date() } });
    await logDashboardAction({ churchId, action: APLOS_AUDIT_EVENTS.SYNC_BLOCKED, entityType: "AplosSyncRecord", entityId: syncRecordId, metadata: { settlementId: finixSettlementId, reason: "CONNECTION_NOT_READY" } });
    return { outcome: "BLOCKED", syncRecordId, safeMessage: message };
  }

  const attemptNumber = attemptCountBefore + 1;
  const newlyConfirmed: ConfirmedContribution[] = [];

  for (const contribution of remaining) {
    const startedAt = new Date();
    try {
      const posted = await postAplosContribution(contribution.payload, token, aplosAccountId);
      newlyConfirmed.push({ payloadHash: contribution.payloadHash, aplosContributionId: String(posted.id) });
      await prisma.aplosSyncAttempt.create({
        data: { syncRecordId, attemptNumber, startedAt, completedAt: new Date(), result: "SUCCEEDED", httpStatus: 200 },
      });
    } catch (err) {
      const postError = err instanceof AplosContributionPostError ? err : null;
      const normalized = postError?.normalized ?? { category: "UNKNOWN_ERROR" as const, retryable: false, safeMessage: "An unexpected error occurred posting to Aplos." };
      const ambiguous = postError?.ambiguous ?? false;

      await prisma.aplosSyncAttempt.create({
        data: {
          syncRecordId,
          attemptNumber,
          startedAt,
          completedAt: new Date(),
          result: ambiguous ? "AMBIGUOUS_TIMEOUT" : "FAILED",
          safeErrorCode: normalized.category,
          safeErrorMessage: normalized.safeMessage,
        },
      });

      const allConfirmed = [...confirmed, ...newlyConfirmed];

      if (ambiguous) {
        return finalizeNeedsReview(churchId, syncRecordId, finixSettlementId, allConfirmed, remaining.length - newlyConfirmed.length);
      }
      if (normalized.retryable && attemptNumber < MAX_AUTOMATIC_RETRY_ATTEMPTS) {
        return finalizeRetryScheduled(churchId, syncRecordId, finixSettlementId, allConfirmed, attemptNumber, normalized.safeMessage, normalized.category);
      }
      return finalizeFailed(churchId, syncRecordId, finixSettlementId, allConfirmed, attemptNumber, normalized.safeMessage, normalized.category);
    }
  }

  return finalizeSynced(churchId, syncRecordId, finixSettlementId, [...confirmed, ...newlyConfirmed]);
}

async function finalizeSynced(churchId: string, syncRecordId: string, finixSettlementId: string, confirmed: ConfirmedContribution[]): Promise<SyncSettlementResult> {
  await prisma.aplosSyncRecord.update({
    where: { id: syncRecordId },
    data: { status: "SYNCED", syncedAt: new Date(), aplosContributionId: JSON.stringify(confirmed), blockedReason: null, lastErrorCode: null, lastErrorMessage: null },
  });
  await prisma.aplosConnection.updateMany({ where: { churchId }, data: { lastSuccessfulSyncAt: new Date() } });
  await logDashboardAction({ churchId, action: APLOS_AUDIT_EVENTS.SYNC_SUCCEEDED, entityType: "AplosSyncRecord", entityId: syncRecordId, metadata: { settlementId: finixSettlementId, contributionCount: confirmed.length } });
  return { outcome: "SYNCED", syncRecordId, safeMessage: "Settlement synchronized to Aplos." };
}

async function finalizeNeedsReview(
  churchId: string,
  syncRecordId: string,
  finixSettlementId: string,
  confirmed: ConfirmedContribution[],
  unconfirmedRemainingCount: number
): Promise<SyncSettlementResult> {
  const safeMessage =
    `The result of the last Aplos contribution submission could not be confirmed. ${confirmed.length} contribution(s) for this settlement are confirmed created in Aplos; ` +
    `${unconfirmedRemainingCount} remain unconfirmed. This settlement will not be retried automatically. A WGC administrator must verify the outcome directly in Aplos before proceeding.`;
  await prisma.aplosSyncRecord.update({
    where: { id: syncRecordId },
    data: { status: "NEEDS_REVIEW", requiresManualReview: true, blockedReason: safeMessage, aplosContributionId: JSON.stringify(confirmed) },
  });
  await logDashboardAction({ churchId, action: APLOS_AUDIT_EVENTS.SYNC_NEEDS_REVIEW, entityType: "AplosSyncRecord", entityId: syncRecordId, metadata: { settlementId: finixSettlementId, confirmedCount: confirmed.length } });
  return { outcome: "NEEDS_REVIEW", syncRecordId, safeMessage };
}

async function finalizeRetryScheduled(
  churchId: string,
  syncRecordId: string,
  finixSettlementId: string,
  confirmed: ConfirmedContribution[],
  attemptNumber: number,
  safeMessage: string,
  errorCode: string
): Promise<SyncSettlementResult> {
  const nextAttemptAt = computeNextAttemptAt(attemptNumber);
  await prisma.aplosSyncRecord.update({
    where: { id: syncRecordId },
    data: {
      status: "RETRY_SCHEDULED",
      attemptCount: attemptNumber,
      nextAttemptAt,
      lastErrorCode: errorCode,
      lastErrorMessage: safeMessage,
      aplosContributionId: JSON.stringify(confirmed),
    },
  });
  await logDashboardAction({ churchId, action: APLOS_AUDIT_EVENTS.SYNC_RETRIED, entityType: "AplosSyncRecord", entityId: syncRecordId, metadata: { settlementId: finixSettlementId, attemptNumber, nextAttemptAt } });
  return { outcome: "RETRY_SCHEDULED", syncRecordId, safeMessage };
}

async function finalizeFailed(
  churchId: string,
  syncRecordId: string,
  finixSettlementId: string,
  confirmed: ConfirmedContribution[],
  attemptNumber: number,
  safeMessage: string,
  errorCode: string
): Promise<SyncSettlementResult> {
  await prisma.aplosSyncRecord.update({
    where: { id: syncRecordId },
    data: {
      status: "FAILED",
      attemptCount: attemptNumber,
      lastErrorCode: errorCode,
      lastErrorMessage: safeMessage,
      aplosContributionId: JSON.stringify(confirmed),
    },
  });
  await logDashboardAction({ churchId, action: APLOS_AUDIT_EVENTS.SYNC_FAILED, entityType: "AplosSyncRecord", entityId: syncRecordId, metadata: { settlementId: finixSettlementId, attemptNumber } });
  return { outcome: "FAILED", syncRecordId, safeMessage };
}

/**
 * Manual retry entrypoint for a future Checkpoint 8 "Retry" UI action.
 * Refuses NEEDS_REVIEW and SYNCED records outright — the one rule this
 * integration must never let a UI action bypass, per
 * docs/integrations/aplos.md section 7. A FAILED or BLOCKED record is
 * reset to PENDING so the normal processSettlement path re-evaluates it
 * from scratch (including re-checking mapping/configuration, in case the
 * merchant fixed the underlying issue).
 */
export async function requestManualRetry(churchId: string, syncRecordId: string): Promise<SyncSettlementResult> {
  const record = await prisma.aplosSyncRecord.findUnique({ where: { id: syncRecordId } });
  if (!record || record.churchId !== churchId) {
    throw new Error("Sync record not found for this organization.");
  }
  if (record.status === "NEEDS_REVIEW" || record.requiresManualReview) {
    return { outcome: "NEEDS_REVIEW", syncRecordId, safeMessage: "This settlement requires manual verification in Aplos and cannot be retried from here." };
  }
  if (record.status === "SYNCED") {
    return { outcome: "ALREADY_SYNCED", syncRecordId, safeMessage: "This settlement has already been synchronized to Aplos." };
  }
  if (record.status === "PROCESSING") {
    return { outcome: "SKIPPED_LOCKED", syncRecordId, safeMessage: "A sync attempt for this settlement is already in progress." };
  }
  if (record.settlementId && (record.status === "FAILED" || record.status === "BLOCKED")) {
    await prisma.aplosSyncRecord.update({ where: { id: syncRecordId }, data: { status: "PENDING", nextAttemptAt: null } });
  }
  if (!record.settlementId) {
    throw new Error("Sync record has no associated settlement.");
  }
  return processSettlement(churchId, record.settlementId);
}
