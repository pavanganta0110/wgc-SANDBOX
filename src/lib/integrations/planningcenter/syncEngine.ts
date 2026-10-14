import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeNextAttemptAt, MAX_AUTOMATIC_RETRY_ATTEMPTS } from "@/lib/integrations/aplos/retryPolicy";
import { getClientForChurch } from "./service";
import { buildSettlementPlan, SKIP_MESSAGES, type PlannedGift } from "./giftPlan";
import { HELD_MESSAGES } from "./syncTypes";
import { batchDescription, buildDonationPayload, resolveTargetFund, type DonationPayload } from "./giftPayload";
import { commitBatch, createBatch, createDonation, findBatchByDescription, getBatch, listBatchDonations, type PcoDonation } from "./givingApi";
import { RECONCILE_GRACE_MS, reconcileSending } from "./syncReconcile";
import { computeStoredGivingReadiness } from "./syncConfig";
import { resolveDonorLink } from "./personMatching";
import { createPerson } from "./people";
import { notifySyncFailed, notifySyncNeedsReview } from "./notifications";
import { PlanningCenterApiError, PlanningCenterAuthError, PlanningCenterConnectionError } from "./errors";
import type { PlanningCenterClient } from "./resourceClient";

/**
 * The gift sync engine: one Planning Center batch per WGC settlement.
 *
 * READ THIS BEFORE CHANGING ANYTHING. Planning Center has no idempotency key
 * and a donation has no field for our own id, so a blind retry of a POST can
 * create a duplicate donation on a church's ledger. The protocol below exists
 * to make that impossible:
 *
 *  1. A settlement is CLAIMED with a conditional update, so two cron runs can
 *     never work the same one.
 *  2. Every WGC payment has exactly one PlanningCenterDonationRecord, forever
 *     (@@unique([churchId, paymentId])). A payment already recorded under any
 *     sync record is never pushed again.
 *  3. A donation is marked SENDING *before* its POST. If the process dies, or
 *     the request times out, the record stays SENDING.
 *  4. SENDING is resolved only by READING the batch (reconcileSending), and
 *     only concluded "never landed" after a grace period, because a timed-out
 *     request can still complete on Planning Center's side.
 *  5. Ambiguity that reading can't settle becomes NEEDS_REVIEW and is never
 *     retried automatically.
 *  6. A batch is verified against what we recorded BEFORE it is committed.
 *
 * Money rule: this module only ever COPIES settled gifts to Planning Center.
 * It never creates, changes or reverses a WGC Payment.
 */

export const STALE_PROCESSING_MS = 15 * 60 * 1000;
export const DEFAULT_TIME_BUDGET_MS = 45_000;
/** How often a PARTIAL settlement (gifts held for a donor match) is looked at again. */
export const PARTIAL_RECHECK_MS = 60 * 60 * 1000;
/** How soon to look at a batch whose commit is still settling. */
export const COMMIT_RECHECK_MS = 5 * 60 * 1000;

export type SyncOutcome =
  | "SYNCED"
  | "PARTIAL"
  | "IN_PROGRESS"
  | "DRY_RUN"
  | "BLOCKED"
  | "BLOCKED_AWAITING_FEES"
  | "RETRY_SCHEDULED"
  | "FAILED"
  | "NEEDS_REVIEW"
  | "ALREADY_DONE"
  | "NOT_DUE"
  | "CONTENDED"
  | "OUT_OF_SCOPE"
  | "OFF";

export interface EngineOptions {
  /** Test seam; defaults to a client for the church. */
  client?: PlanningCenterClient;
  now?: () => Date;
  timeBudgetMs?: number;
  /** Re-run a settlement that already has a stored dry-run result. */
  recomputeDryRun?: boolean;
}

type SyncRecord = NonNullable<Awaited<ReturnType<typeof prisma.planningCenterSyncRecord.findUnique>>>;
type DonationRecord = NonNullable<Awaited<ReturnType<typeof prisma.planningCenterDonationRecord.findUnique>>>;
type Config = NonNullable<Awaited<ReturnType<typeof prisma.planningCenterSyncConfig.findUnique>>>;

interface Tally {
  created: number;
  skipped: number;
  held: number;
}

interface Ctx {
  churchId: string;
  orgId: string;
  config: Config;
  mode: "DRY_RUN" | "LIVE";
  mappingByFundId: Map<string, string>;
  now: () => Date;
  deadline: number;
  getClient: () => Promise<PlanningCenterClient>;
}

// ───────────────────────── error classification ─────────────────────────

export type WriteErrorKind = "AMBIGUOUS" | "REJECTED" | "NOT_FOUND" | "DENIED" | "AUTH";

/**
 * Classifies a failed POST. Only a response that PROVES Planning Center did
 * not process the request counts as a rejection; anything else — network
 * failure, timeout, 5xx, 429, a malformed success — is AMBIGUOUS and is
 * resolved by reading, never by re-sending.
 */
export function classifyWriteError(err: unknown): WriteErrorKind {
  if (err instanceof PlanningCenterApiError) {
    if (err.status === 401) return "AUTH";
    if (err.status === 403) return "DENIED";
    if (err.status === 404) return "NOT_FOUND";
    if (err.status === 400 || err.status === 422) return "REJECTED";
    if (err.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429) return "REJECTED";
  }
  return "AMBIGUOUS";
}

// ─────────────────────────────── entry point ───────────────────────────────

export async function processSettlementSync(churchId: string, finixSettlementId: string, options: EngineOptions = {}): Promise<SyncOutcome> {
  const now = options.now ?? (() => new Date());

  const config = await prisma.planningCenterSyncConfig.findUnique({ where: { churchId } });
  if (!config || (config.syncMode !== "DRY_RUN" && config.syncMode !== "LIVE")) return "OFF";
  const mode = config.syncMode as "DRY_RUN" | "LIVE";

  // The watermark: going live never back-posts history a church may have keyed in by hand.
  if (mode === "LIVE") {
    const settlement = await prisma.finixSettlement.findUnique({ where: { finixSettlementId }, select: { settledAt: true, churchId: true } });
    if (!settlement || settlement.churchId !== churchId || !config.enabledAt || !settlement.settledAt || settlement.settledAt < config.enabledAt) {
      return "OUT_OF_SCOPE";
    }
  }

  let record = await getOrCreateRecord(churchId, finixSettlementId, config.syncVersion);

  const gate = statusGate(record, mode, now(), options, config.autoCommitBatches);
  if (gate !== "PROCEED") return gate;

  const connection = await prisma.planningCenterConnection.findUnique({ where: { churchId } });
  const readiness = await computeStoredGivingReadiness(churchId);
  if (!connection || connection.status !== "CONNECTED" || !connection.pcoOrganizationId || !readiness.ready) {
    const reason = !connection || connection.status !== "CONNECTED" ? "Planning Center isn't connected." : readiness.reasons[0] ?? "Giving setup is incomplete.";
    await prisma.planningCenterSyncRecord.updateMany({
      where: { id: record.id, status: { in: ["PENDING", "IN_PROGRESS", "BLOCKED", "BLOCKED_AWAITING_FEES", "RETRY_SCHEDULED", "DRY_RUN", "PARTIAL"] } },
      data: { status: "BLOCKED", blockedReason: reason },
    });
    return "BLOCKED";
  }

  // Claim. Optimistic on status AND updatedAt, so a competing worker's claim makes ours a no-op.
  const previousStatus = record.status;
  const stale = previousStatus === "PROCESSING";
  const claimed = await prisma.planningCenterSyncRecord.updateMany({
    where: { id: record.id, status: record.status, updatedAt: record.updatedAt },
    data: { status: "PROCESSING", lastAttemptAt: now(), startedAt: record.startedAt ?? now(), blockedReason: null },
  });
  if (claimed.count !== 1) return "CONTENDED";
  record = { ...record, status: "PROCESSING" };

  const mappings = await prisma.planningCenterFundMapping.findMany({ where: { churchId } });
  let clientPromise: Promise<PlanningCenterClient> | null = null;
  const ctx: Ctx = {
    churchId,
    orgId: connection.pcoOrganizationId,
    config,
    mode,
    mappingByFundId: new Map(mappings.map((m) => [m.fundId, m.pcoFundId])),
    now,
    deadline: now().getTime() + (options.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS),
    getClient: () => (clientPromise ??= options.client ? Promise.resolve(options.client) : getClientForChurch(churchId)),
  };

  const tally: Tally = { created: 0, skipped: 0, held: 0 };
  const startedMs = now().getTime();
  try {
    const result = await runClaimed(ctx, record, finixSettlementId, tally, stale, previousStatus);
    return await finish(ctx, record, result, tally, startedMs);
  } catch (err) {
    return handleRunError(ctx, record, err, tally, startedMs);
  }
}

// ─────────────────────────────── gating ───────────────────────────────

function statusGate(record: SyncRecord, mode: "DRY_RUN" | "LIVE", now: Date, options: EngineOptions, autoCommit: boolean): SyncOutcome | "PROCEED" {
  switch (record.status) {
    case "SYNCED": {
      // A finished settlement only needs attention while its commit is unsettled.
      const commitUnsettled = record.commitStatus === "COMMITTING" || (record.commitStatus === "NOT_COMMITTED" && autoCommit);
      if (!commitUnsettled || !record.pcoBatchId) return "ALREADY_DONE";
      return record.nextAttemptAt && record.nextAttemptAt > now ? "NOT_DUE" : "PROCEED";
    }
    case "CANCELLED":
      return "ALREADY_DONE";
    case "NEEDS_REVIEW":
      return "NEEDS_REVIEW";
    case "FAILED":
      return "FAILED";
    case "RETRY_SCHEDULED":
    case "PARTIAL":
      return record.nextAttemptAt && record.nextAttemptAt > now ? "NOT_DUE" : "PROCEED";
    case "PROCESSING":
      // Someone is working it — unless that someone died.
      return record.lastAttemptAt && now.getTime() - record.lastAttemptAt.getTime() > STALE_PROCESSING_MS ? "PROCEED" : "CONTENDED";
    case "DRY_RUN":
      return mode === "DRY_RUN" && !options.recomputeDryRun ? "ALREADY_DONE" : "PROCEED";
    default:
      return "PROCEED"; // PENDING, IN_PROGRESS, BLOCKED, BLOCKED_AWAITING_FEES
  }
}

async function getOrCreateRecord(churchId: string, settlementId: string, syncVersion: number): Promise<SyncRecord> {
  const where = { churchId_settlementId_syncVersion: { churchId, settlementId, syncVersion } };
  const existing = await prisma.planningCenterSyncRecord.findUnique({ where });
  if (existing) return existing;
  try {
    return await prisma.planningCenterSyncRecord.create({ data: { churchId, settlementId, syncVersion } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const raced = await prisma.planningCenterSyncRecord.findUnique({ where });
      if (raced) return raced;
    }
    throw err;
  }
}

// ──────────────────────────── the claimed run ────────────────────────────

type RunResult =
  | { status: "SYNCED" | "PARTIAL" | "DRY_RUN" | "IN_PROGRESS" | "NEEDS_REVIEW" | "FAILED"; message?: string; commitStatus?: string; nextAttemptAt?: Date }
  | { status: "BLOCKED" | "BLOCKED_AWAITING_FEES"; message: string }
  | { status: "RETRY_SCHEDULED"; message: string; nextAttemptAt: Date };

async function runClaimed(ctx: Ctx, record: SyncRecord, finixSettlementId: string, tally: Tally, recoveringStale: boolean, previousStatus: string): Promise<RunResult> {
  // A finished settlement that is only waiting on its commit skips straight to the commit phase,
  // after re-verifying the batch (it may have been edited since).
  if (previousStatus === "SYNCED" && record.pcoBatchId) {
    const client = await ctx.getClient();
    const created = await prisma.planningCenterDonationRecord.findMany({ where: { syncRecordId: record.id, status: "CREATED" } });
    const verification = await verifyBatch(client, record.pcoBatchId, created);
    if (!verification.ok) return { status: "NEEDS_REVIEW", message: verification.message };
    return commitPhase(ctx, record, "SYNCED", verification.extras === 0, client);
  }

  const plan = await buildSettlementPlan(ctx.churchId, finixSettlementId);
  if (!plan.eligible) {
    return { status: plan.awaitingFees ? "BLOCKED_AWAITING_FEES" : "BLOCKED", message: plan.safeMessage };
  }
  await ensureDonationRecords(ctx.churchId, record.id, plan.gifts);

  const giftByPayment = new Map(plan.gifts.map((g) => [g.paymentId, g]));
  let records = await prisma.planningCenterDonationRecord.findMany({ where: { syncRecordId: record.id }, orderBy: { createdAt: "asc" } });
  tally.skipped = records.filter((r) => r.status === "SKIPPED").length;

  // Nothing to send at all (everything skipped): done, and no empty batch is created.
  if (!records.some((r) => ["PENDING", "HELD", "SENDING", "CREATED", "NEEDS_REVIEW", "FAILED"].includes(r.status))) {
    return { status: ctx.mode === "DRY_RUN" ? "DRY_RUN" : "SYNCED", commitStatus: "N_A" };
  }

  const donors = await loadDonors(ctx.churchId, records);

  if (ctx.mode === "DRY_RUN") {
    for (const rec of records.filter((r) => r.status === "PENDING" || r.status === "HELD")) {
      const gift = giftByPayment.get(rec.paymentId);
      if (!gift) continue;
      const target = await resolveTarget(ctx, gift, donors.get(rec.donorId ?? ""), false);
      await recordPreview(rec.id, target);
      if (target.kind === "HELD") tally.held++;
    }
    return { status: "DRY_RUN" };
  }

  // ── LIVE ──
  const client = await ctx.getClient();
  const batch = await ensureBatch(ctx, record, client, plan.settledAt, finixSettlementId);
  if (batch.kind === "RETRY_LATER") {
    if (record.attemptCount + 1 >= MAX_AUTOMATIC_RETRY_ATTEMPTS) {
      return { status: "NEEDS_REVIEW", message: "Planning Center never confirmed that this deposit's batch was created. Check Planning Center Giving for a batch with this deposit's id before retrying." };
    }
    return { status: "RETRY_SCHEDULED", message: "Planning Center didn't confirm the new batch yet. WGC will look for it again shortly instead of creating another.", nextAttemptAt: new Date(ctx.now().getTime() + RECONCILE_GRACE_MS) };
  }
  const batchId = batch.id;

  // Resolve anything left SENDING by an earlier run (or a crash) before sending anything new.
  if (records.some((r) => r.status === "SENDING") || recoveringStale) {
    await reconcileStuckSends(ctx, record, batchId, client);
    records = await prisma.planningCenterDonationRecord.findMany({ where: { syncRecordId: record.id }, orderBy: { createdAt: "asc" } });
  }

  let outOfTime = false;
  // A timed-out send that turns out to have landed is adopted and the run carries on. Bounded, so a
  // flaky connection can't spin forever.
  let ambiguities = 0;

  sendPass: while (true) {
    const toSend = records.filter((r) => r.status === "PENDING" || r.status === "HELD");
    let ambiguous = false;

    for (const rec of toSend) {
      if (ctx.now().getTime() >= ctx.deadline) {
        outOfTime = true;
        break;
      }
      const gift = giftByPayment.get(rec.paymentId);
      if (!gift) continue;

      // A gift that stopped being pushable since it was recorded (e.g. refunded) is skipped, never sent.
      if (gift.decision.kind === "SKIP") {
        await prisma.planningCenterDonationRecord.updateMany({
          where: { id: rec.id, status: { in: ["PENDING", "HELD"] } },
          data: { status: "SKIPPED", skippedReason: gift.decision.reason },
        });
        tally.skipped++;
        continue;
      }

      const target = await resolveTarget(ctx, gift, donors.get(rec.donorId ?? ""), true);
      if (target.kind === "HELD") {
        await markHeld(rec.id, target);
        tally.held++;
        continue;
      }
      if (target.kind === "REVIEW") {
        await prisma.planningCenterDonationRecord.updateMany({
          where: { id: rec.id, status: { in: ["PENDING", "HELD"] } },
          data: { status: "NEEDS_REVIEW", lastErrorCode: target.code, lastErrorMessage: target.message },
        });
        continue;
      }

      // Mark SENDING first. Only one worker can win this conditional update.
      const sent = await prisma.planningCenterDonationRecord.updateMany({
        where: { id: rec.id, status: { in: ["PENDING", "HELD"] } },
        data: {
          status: "SENDING",
          sendingStartedAt: ctx.now(),
          attemptCount: { increment: 1 },
          payloadHash: target.payload.hash,
          payloadJson: target.payload.summary as unknown as Prisma.InputJsonValue,
          pcoPersonId: target.payload.summary.pcoPersonId,
          pcoFundId: target.payload.summary.pcoFundId,
          skippedReason: null,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      });
      if (sent.count !== 1) continue;

      try {
        const created = await createDonation(client, batchId, target.payload.body);
        await prisma.planningCenterDonationRecord.update({ where: { id: rec.id }, data: { status: "CREATED", pcoDonationId: created.id, sendingStartedAt: null } });
        tally.created++;
      } catch (err) {
        const kind = classifyWriteError(err);
        if (kind === "AMBIGUOUS") {
          // Leave it SENDING. Send nothing else until we've read what Planning Center actually has.
          ambiguous = true;
          break;
        }
        // Anything else is a definite answer: Planning Center did not create it.
        if (kind === "DENIED" || kind === "AUTH") {
          await prisma.planningCenterDonationRecord.update({ where: { id: rec.id }, data: { status: "PENDING", sendingStartedAt: null } });
          throw err; // stops the run; handled below
        }
        await prisma.planningCenterDonationRecord.update({
          where: { id: rec.id },
          data:
            kind === "NOT_FOUND"
              ? { status: "NEEDS_REVIEW", sendingStartedAt: null, lastErrorCode: "NOT_FOUND", lastErrorMessage: "The donor's Planning Center person, or the fund, no longer exists. Fix the link or mapping, then retry." }
              : { status: "FAILED", sendingStartedAt: null, lastErrorCode: "REJECTED", lastErrorMessage: "Planning Center rejected this gift." },
        });
      }
    }

    if (!ambiguous) break sendPass;

    await reconcileStuckSends(ctx, record, batchId, client);
    const stillSending = await prisma.planningCenterDonationRecord.count({ where: { syncRecordId: record.id, status: "SENDING" } });
    if (stillSending > 0) {
      if (record.attemptCount + 1 >= MAX_AUTOMATIC_RETRY_ATTEMPTS) {
        return { status: "NEEDS_REVIEW", message: "Planning Center never confirmed whether some gifts were added. Check the batch in Planning Center to see which are there." };
      }
      return { status: "RETRY_SCHEDULED", message: "Planning Center didn't confirm a gift yet. WGC will check what it received before sending anything again.", nextAttemptAt: new Date(ctx.now().getTime() + RECONCILE_GRACE_MS) };
    }
    if (++ambiguities >= 3) return { status: "IN_PROGRESS", nextAttemptAt: ctx.now() };
    records = await prisma.planningCenterDonationRecord.findMany({ where: { syncRecordId: record.id }, orderBy: { createdAt: "asc" } });
  }

  records = await prisma.planningCenterDonationRecord.findMany({ where: { syncRecordId: record.id } });
  tally.created = records.filter((r) => r.status === "CREATED").length;
  tally.held = records.filter((r) => r.status === "HELD").length;
  tally.skipped = records.filter((r) => r.status === "SKIPPED").length;

  if (outOfTime || records.some((r) => r.status === "PENDING" || r.status === "SENDING")) {
    return { status: "IN_PROGRESS", nextAttemptAt: ctx.now() };
  }

  const needsReview = records.filter((r) => r.status === "NEEDS_REVIEW");
  if (needsReview.length > 0) {
    return { status: "NEEDS_REVIEW", message: needsReview[0].lastErrorMessage ?? "Some gifts need a person to look at them." };
  }
  const failed = records.filter((r) => r.status === "FAILED");
  if (failed.length > 0) {
    return { status: "FAILED", message: `${failed.length} gift${failed.length === 1 ? " was" : "s were"} rejected by Planning Center.` };
  }

  // Verify against what we recorded BEFORE anything is committed.
  const verification = await verifyBatch(client, batchId, records.filter((r) => r.status === "CREATED"));
  if (!verification.ok) return { status: "NEEDS_REVIEW", message: verification.message };

  return commitPhase(ctx, record, tally.held > 0 ? "PARTIAL" : "SYNCED", verification.extras === 0, client);
}

// ─────────────────────────── donation records ───────────────────────────

/** Creates one row per payment. A payment already recorded under any sync record is left alone: never pushed twice. */
async function ensureDonationRecords(churchId: string, syncRecordId: string, gifts: PlannedGift[]): Promise<void> {
  const existing = await prisma.planningCenterDonationRecord.findMany({ where: { churchId, paymentId: { in: gifts.map((g) => g.paymentId) } }, select: { paymentId: true } });
  const have = new Set(existing.map((e) => e.paymentId));
  const fresh = gifts.filter((g) => !have.has(g.paymentId));
  if (fresh.length === 0) return;
  await prisma.planningCenterDonationRecord.createMany({
    data: fresh.map((g) => ({
      syncRecordId,
      churchId,
      paymentId: g.paymentId,
      donorId: g.donorId,
      status: g.decision.kind === "SKIP" ? "SKIPPED" : "PENDING",
      skippedReason: g.decision.kind === "SKIP" ? g.decision.reason : null,
      amountCents: g.amountCents,
      fundId: g.fundId,
      receivedOn: g.receivedOn,
    })),
    skipDuplicates: true, // the unique constraint is the real guarantee
  });
}

interface DonorLite {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  anonymousPreference: boolean;
}

async function loadDonors(churchId: string, records: DonationRecord[]): Promise<Map<string, DonorLite>> {
  const ids = [...new Set(records.map((r) => r.donorId).filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return new Map();
  const donors = await prisma.donor.findMany({ where: { churchId, id: { in: ids } }, select: { id: true, name: true, email: true, phone: true, anonymousPreference: true } });
  return new Map(donors.map((d) => [d.id, d]));
}

// ─────────────────────────── choosing the target ───────────────────────────

type Target =
  | { kind: "READY"; payload: DonationPayload; wouldCreatePerson?: boolean }
  | { kind: "HELD"; code: string }
  | { kind: "REVIEW"; code: string; message: string };

async function resolveTarget(ctx: Ctx, gift: PlannedGift, donor: DonorLite | undefined, writes: boolean): Promise<Target> {
  const fund = resolveTargetFund(gift.fundId, ctx.mappingByFundId, ctx.config.defaultPcoFundId);
  if (!fund) {
    return { kind: "REVIEW", code: "NO_FUND", message: "No Planning Center fund is mapped for this gift and no default fund is set." };
  }
  const paymentSourceId = ctx.config.pcoPaymentSourceId;
  if (!paymentSourceId) return { kind: "REVIEW", code: "NO_SOURCE", message: "The WGC payment source isn't set up in Planning Center." };

  // Anonymity is the donor's choice: never attach a name they asked us to withhold.
  const anonymous = gift.isAnonymous || !gift.donorId || !donor || donor.anonymousPreference;
  let personId: string | null = null;
  let wouldCreatePerson = false;

  if (!anonymous) {
    const client = await ctx.getClient();
    const state = await resolveDonorLink(ctx.churchId, gift.donorId!, ctx.orgId, client);
    if (state.status === "LINKED") {
      personId = state.pcoPersonId;
    } else {
      const policy = ctx.config.unmatchedDonorPolicy;
      if (policy === "ANONYMOUS") {
        personId = null;
      } else if (policy === "CREATE_PERSON" && state.status === "NO_MATCH") {
        if (!writes) wouldCreatePerson = true;
        else {
          const created = await createAndLinkPerson(ctx, donor!, client);
          if (created.kind === "HELD") return created;
          personId = created.personId;
        }
      } else {
        return { kind: "HELD", code: state.status === "NEEDS_REVIEW" ? "PERSON_NEEDS_REVIEW" : "PERSON_NOT_FOUND" };
      }
    }
  }

  return { kind: "READY", wouldCreatePerson, payload: buildDonationPayload({ gift, paymentSourceId, pcoFundId: fund.pcoFundId, pcoPersonId: personId }) };
}

/** CREATE_PERSON policy. A POST: never retried. If it can't be confirmed we look for the person by reading next time. */
async function createAndLinkPerson(ctx: Ctx, donor: DonorLite, client: PlanningCenterClient): Promise<{ kind: "OK"; personId: string } | { kind: "HELD"; code: string }> {
  const parts = (donor.name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { kind: "HELD", code: "NO_NAME" };
  const lastName = parts[parts.length - 1];
  const firstName = parts.slice(0, -1).join(" ");

  let person: { id: string };
  try {
    person = await createPerson(client, { firstName, lastName, email: donor.email, phone: donor.phone });
  } catch (err) {
    if (classifyWriteError(err) === "AMBIGUOUS" || err instanceof Error) {
      // The person may exist now. Force a fresh lookup on the next run rather than creating a second one.
      await prisma.planningCenterPersonLink.updateMany({ where: { churchId: ctx.churchId, donorId: donor.id }, data: { lastCheckedAt: new Date(0) } });
    }
    return { kind: "HELD", code: "PERSON_CREATE_UNCERTAIN" };
  }

  const now = new Date();
  const data = {
    churchId: ctx.churchId, donorId: donor.id, pcoOrganizationId: ctx.orgId, status: "LINKED", pcoPersonId: person.id,
    pcoPersonName: donor.name, matchMethod: "CREATED", candidatesJson: Prisma.DbNull, matchedAt: now, lastCheckedAt: now,
  };
  await prisma.planningCenterPersonLink.upsert({ where: { churchId_donorId: { churchId: ctx.churchId, donorId: donor.id } }, create: data, update: data });
  return { kind: "OK", personId: person.id };
}

async function recordPreview(id: string, target: Target): Promise<void> {
  if (target.kind === "READY") {
    await prisma.planningCenterDonationRecord.update({
      where: { id },
      data: {
        payloadHash: target.payload.hash,
        payloadJson: { ...target.payload.summary, ...(target.wouldCreatePerson ? { wouldCreatePerson: true } : {}) } as unknown as Prisma.InputJsonValue,
        pcoPersonId: target.payload.summary.pcoPersonId,
        pcoFundId: target.payload.summary.pcoFundId,
        status: "PENDING",
        skippedReason: null,
      },
    });
  } else if (target.kind === "HELD") {
    await markHeld(id, target);
  } else {
    await prisma.planningCenterDonationRecord.update({ where: { id }, data: { status: "PENDING", lastErrorCode: target.code, lastErrorMessage: target.message } });
  }
}

async function markHeld(id: string, target: { code: string }): Promise<void> {
  await prisma.planningCenterDonationRecord.updateMany({
    where: { id, status: { in: ["PENDING", "HELD"] } },
    data: { status: "HELD", skippedReason: target.code, lastErrorCode: target.code, lastErrorMessage: HELD_MESSAGES[target.code] ?? "Waiting for a Planning Center person." },
  });
}

// ───────────────────────────── the batch ─────────────────────────────

async function ensureBatch(
  ctx: Ctx,
  record: SyncRecord,
  client: PlanningCenterClient,
  settledAt: Date | null,
  finixSettlementId: string
): Promise<{ kind: "OK"; id: string } | { kind: "RETRY_LATER" }> {
  if (record.pcoBatchId) return { kind: "OK", id: record.pcoBatchId };

  const description = batchDescription(finixSettlementId, settledAt);
  const persist = async (id: string) => {
    await prisma.planningCenterSyncRecord.update({ where: { id: record.id }, data: { pcoBatchId: id, batchDescription: description, commitStatus: "NOT_COMMITTED" } });
    record.pcoBatchId = id;
    return { kind: "OK" as const, id };
  };

  // Always LOOK before creating: it covers a crash right after a create, and a create that timed out.
  const existing = await findBatchByDescription(client, description);
  if (existing) return persist(existing.id);

  try {
    const created = await createBatch(client, description);
    return await persist(created.id);
  } catch (err) {
    if (classifyWriteError(err) !== "AMBIGUOUS") throw err;
    const found = await findBatchByDescription(client, description);
    if (found) return persist(found.id);
    return { kind: "RETRY_LATER" };
  }
}

/** Resolves SENDING records by reading the batch. See syncReconcile.ts for the rules. */
async function reconcileStuckSends(ctx: Ctx, record: SyncRecord, batchId: string, client: PlanningCenterClient): Promise<void> {
  const sending = await prisma.planningCenterDonationRecord.findMany({ where: { syncRecordId: record.id, status: "SENDING" } });
  if (sending.length === 0) return;

  const [batchDonations, recorded] = await Promise.all([
    listBatchDonations(client, batchId),
    prisma.planningCenterDonationRecord.findMany({ where: { churchId: ctx.churchId, pcoDonationId: { not: null } }, select: { pcoDonationId: true } }),
  ]);
  const known = new Set(recorded.map((r) => r.pcoDonationId));
  const unrecorded: PcoDonation[] = batchDonations.filter((d) => !known.has(d.id) && d.paymentSourceId === ctx.config.pcoPaymentSourceId);

  const decision = reconcileSending(
    sending.map((s) => ({ id: s.id, pcoPersonId: s.pcoPersonId, amountCents: s.amountCents, receivedOn: s.receivedOn, sendingStartedAt: s.sendingStartedAt ?? new Date(0) })),
    unrecorded,
    ctx.now()
  );

  for (const a of decision.adopt) {
    await prisma.planningCenterDonationRecord.update({ where: { id: a.recordId }, data: { status: "CREATED", pcoDonationId: a.pcoDonationId, sendingStartedAt: null } });
  }
  for (const id of decision.notCreated) {
    // Proven absent after the grace period: it is safe to send again.
    await prisma.planningCenterDonationRecord.update({ where: { id }, data: { status: "PENDING", sendingStartedAt: null } });
  }
  for (const id of decision.undecidable) {
    await prisma.planningCenterDonationRecord.update({
      where: { id },
      data: { status: "NEEDS_REVIEW", lastErrorCode: "AMBIGUOUS", lastErrorMessage: "Planning Center has more matching gifts in this batch than WGC sent. Check the batch to see which are yours." },
    });
  }
  // decision.wait: leave as SENDING; the next run looks again after the grace period.
}

async function verifyBatch(
  client: PlanningCenterClient,
  batchId: string,
  created: DonationRecord[]
): Promise<{ ok: true; extras: number } | { ok: false; message: string }> {
  const donations = await listBatchDonations(client, batchId);
  const byId = new Map(donations.map((d) => [d.id, d]));

  for (const r of created) {
    const d = r.pcoDonationId ? byId.get(r.pcoDonationId) : undefined;
    if (!d) return { ok: false, message: "A gift WGC recorded is missing from the Planning Center batch. Check the batch before anything is committed." };
    if (d.amountCents !== r.amountCents) return { ok: false, message: "A gift in the Planning Center batch has a different amount than WGC sent. Check the batch before anything is committed." };
  }
  const ours = new Set(created.map((r) => r.pcoDonationId));
  // Gifts someone added by hand to our batch are not ours to commit.
  const extras = donations.filter((d) => !ours.has(d.id)).length;
  return { ok: true, extras };
}

async function commitPhase(ctx: Ctx, record: SyncRecord, finalStatus: "SYNCED" | "PARTIAL", noExtras = true, client?: PlanningCenterClient): Promise<RunResult> {
  const c = client ?? (await ctx.getClient());
  const batchId = record.pcoBatchId!;
  const commitStatusOf = (status: string | undefined) => (status === "committed" ? "COMMITTED" : status === "updating" ? "COMMITTING" : "NOT_COMMITTED");

  let batch = await getBatch(c, batchId);
  let commitStatus = commitStatusOf(batch?.status);

  // Commit only if the church asked for it AND the batch holds nothing but what WGC sent.
  if (ctx.config.autoCommitBatches && noExtras && commitStatus === "NOT_COMMITTED") {
    try {
      await commitBatch(c, batchId);
    } catch (err) {
      // A 422 usually means "already committed"; whatever happened is settled by reading the batch again.
      const kind = classifyWriteError(err);
      if (kind === "DENIED" || kind === "AUTH") throw err;
    }
    batch = await getBatch(c, batchId);
    commitStatus = commitStatusOf(batch?.status);
  }

  // Look at it again soon while a commit is still settling or still wanted; otherwise only PARTIAL needs a later look.
  const commitUnsettled = commitStatus === "COMMITTING" || (commitStatus === "NOT_COMMITTED" && ctx.config.autoCommitBatches && noExtras);
  let nextAttemptAt: Date | undefined;
  if (commitUnsettled) nextAttemptAt = new Date(ctx.now().getTime() + COMMIT_RECHECK_MS);
  else if (finalStatus === "PARTIAL") nextAttemptAt = new Date(ctx.now().getTime() + PARTIAL_RECHECK_MS);

  return { status: finalStatus, commitStatus, nextAttemptAt };
}

// ─────────────────────────── finishing and errors ───────────────────────────

async function finish(ctx: Ctx, record: SyncRecord, result: RunResult, tally: Tally, startedMs: number): Promise<SyncOutcome> {
  const now = ctx.now();
  const data: Prisma.PlanningCenterSyncRecordUpdateInput = { status: result.status, lastAttemptAt: now, blockedReason: null };

  if ("message" in result && result.message) {
    if (result.status === "BLOCKED" || result.status === "BLOCKED_AWAITING_FEES") data.blockedReason = result.message;
    else data.lastErrorMessage = result.message;
  }
  if (result.status === "SYNCED" || result.status === "PARTIAL") {
    data.syncedAt = now;
    data.lastErrorCode = null;
    data.lastErrorMessage = null;
    data.requiresManualReview = false;
  }
  if (result.status === "NEEDS_REVIEW") data.requiresManualReview = true;
  if ("commitStatus" in result && result.commitStatus) data.commitStatus = result.commitStatus;
  if ("nextAttemptAt" in result) data.nextAttemptAt = result.nextAttemptAt ?? null;
  if (result.status === "RETRY_SCHEDULED") data.attemptCount = { increment: 1 };

  await prisma.planningCenterSyncRecord.update({ where: { id: record.id }, data });
  await prisma.planningCenterSyncAttempt.create({
    data: {
      syncRecordId: record.id,
      churchId: ctx.churchId,
      attemptNumber: record.attemptCount + 1,
      outcome: result.status,
      createdCount: tally.created,
      skippedCount: tally.skipped,
      heldCount: tally.held,
      errorCode: result.status === "NEEDS_REVIEW" ? "NEEDS_REVIEW" : null,
      errorMessage: "message" in result ? result.message ?? null : null,
      durationMs: now.getTime() - startedMs,
    },
  });

  await notifyOnce(ctx.churchId, record, result.status, "message" in result ? result.message : undefined);
  return result.status;
}

/** Announces NEEDS_REVIEW / FAILED once per state, never on every retry. */
async function notifyOnce(churchId: string, record: SyncRecord, status: string, message?: string): Promise<void> {
  if (status !== "NEEDS_REVIEW" && status !== "FAILED") return;
  if (record.lastNotifiedStatus === status) return;
  const claimed = await prisma.planningCenterSyncRecord.updateMany({ where: { id: record.id, NOT: { lastNotifiedStatus: status } }, data: { lastNotifiedStatus: status } });
  if (claimed.count !== 1) return;
  const text = message ?? "See the Planning Center settings page for details.";
  if (status === "NEEDS_REVIEW") await notifySyncNeedsReview(churchId, record.settlementId, text);
  else await notifySyncFailed(churchId, record.settlementId, text);
}

async function handleRunError(ctx: Ctx, record: SyncRecord, err: unknown, tally: Tally, startedMs: number): Promise<SyncOutcome> {
  // Raw errors go to the log, never to the church.
  console.error(`planning-center sync: settlement ${record.settlementId} church ${ctx.churchId}:`, err instanceof Error ? err.message : err);

  const reconnect =
    err instanceof PlanningCenterConnectionError ||
    (err instanceof PlanningCenterAuthError && err.normalized.category === "INVALID_GRANT") ||
    (err instanceof PlanningCenterApiError && err.normalized.category === "AUTHENTICATION_REQUIRED");
  if (reconnect) {
    return finish(ctx, record, { status: "BLOCKED", message: "Planning Center needs to be reconnected." }, tally, startedMs);
  }

  if (err instanceof PlanningCenterApiError && err.normalized.category === "ACCESS_DENIED") {
    await prisma.planningCenterConnection.updateMany({ where: { churchId: ctx.churchId }, data: { canWriteGiving: false } });
    return finish(ctx, record, { status: "FAILED", message: "The connected Planning Center user isn't allowed to add gifts. Reconnect with a Finance Administrator account, then retry." }, tally, startedMs);
  }

  if (err instanceof PlanningCenterApiError && err.status === 404) {
    return finish(ctx, record, { status: "BLOCKED", message: "Something in the Planning Center setup (the payment source or a fund) no longer exists. Check the Giving setup." }, tally, startedMs);
  }

  // Everything else — rate limits, outages, timeouts, the unexpected — is retried with backoff, then gives up.
  const attempts = record.attemptCount + 1;
  if (attempts >= MAX_AUTOMATIC_RETRY_ATTEMPTS) {
    await prisma.planningCenterSyncRecord.update({ where: { id: record.id }, data: { attemptCount: { increment: 1 } } });
    return finish(ctx, record, { status: "FAILED", message: "WGC couldn't reach Planning Center after several tries. Retry once the issue is resolved." }, tally, startedMs);
  }
  return finish(
    ctx,
    record,
    { status: "RETRY_SCHEDULED", message: "Planning Center is temporarily unavailable. WGC will try again shortly.", nextAttemptAt: computeNextAttemptAt(attempts, ctx.now()) },
    tally,
    startedMs
  );
}

export { SKIP_MESSAGES, HELD_MESSAGES };
