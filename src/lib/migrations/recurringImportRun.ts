import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { finixClient } from "@/lib/finix/client";
import { parseFinixDate } from "@/lib/finix/parseFinixDate";
import { syncPaymentInstrument } from "@/lib/finix/sync/syncPaymentInstruments";
import { resolveOrCreateDonor } from "@/lib/donors/resolveOrCreateDonor";
import { assertNonprofitApproved } from "@/lib/onboarding/nonprofitVerificationGuard";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { emitEvent } from "@/lib/events/emitEvent";
import { formatPersonName } from "@/lib/formatPersonName";
const SUBMISSION_JOB_STATUSES = ["SUBMITTED", "SUBMISSION_USED"];
import { RECURRING_ENTITY_TYPE, RECURRING_SOURCE_SYSTEM, daysBetween, todayUtc, type RecurringPreview, type RecurringPreviewRow } from "@/lib/migrations/recurringImport";

/**
 * Runs a recurring import that staff already previewed. Rules this file keeps (see docs/ARCHITECTURE.md):
 *  - no Finix call inside a database transaction;
 *  - one idempotency key per row (a SubscriptionAction), so a retry can never create a second subscription,
 *    and a row whose earlier attempt never finished is held for review, never retried blindly;
 *  - it only ever creates schedules with a first charge in the future; it never calls a charge endpoint;
 *  - the organization comes from the job, never from the file.
 */

export const RECURRING_TERMS_VERSION = "2026-11-recurring-migration-v1";
export const PROCESS_CHUNK_SIZE = 10;

export { ATTESTATION_TEXT } from "@/lib/migrations/recurringImportText";
/** The first charge Finix reports may differ from the file by this many days (time zones) before the row is rejected. */
const FIRST_CHARGE_TOLERANCE_DAYS = 1;

export type RecurringRecordStatus = "VALID" | "WARNING" | "INVALID" | "DUPLICATE" | "IMPORTING" | "IMPORTED" | "FAILED" | "NEEDS_REVIEW" | "ROLLED_BACK";

export interface ImportActor {
  userId: string;
  email: string;
  role: string;
}

export interface RecurringJobProgress {
  jobId: string;
  status: string;
  total: number;
  counts: Record<string, number>;
  remaining: number;
  done: boolean;
}

// ---------------------------------------------------------------------------------------------------------------
// Create the job from a previewed import

export async function alreadyImportedFingerprints(churchId: string): Promise<Set<string>> {
  const rows = await prisma.migrationRecord.findMany({
    where: { churchId, entityType: RECURRING_ENTITY_TYPE, status: "IMPORTED" },
    select: { fingerprint: true },
  });
  return new Set(rows.map((r) => r.fingerprint));
}

export async function createRecurringImportJob(params: {
  churchId: string;
  actor: ImportActor;
  fileName: string | null;
  preview: RecurringPreview;
  attestation: { text: string; confirmedAt: string };
  fundMap: Record<string, string>;
}): Promise<{ jobId: string; importable: number }> {
  const { preview } = params;
  const importable = preview.rows.filter((r) => r.status === "VALID" || r.status === "WARNING");
  if (importable.length === 0) throw new Error("There is nothing to import: every row is invalid or already imported.");

  const job = await prisma.migrationJob.create({
    data: {
      churchId: params.churchId,
      sourceSystem: RECURRING_SOURCE_SYSTEM,
      status: "READY",
      entityTypesJson: [RECURRING_ENTITY_TYPE],
      fileName: params.fileName,
      totalRecords: importable.length,
      createdByUserId: params.actor.userId,
      sourceDataJson: { attestation: params.attestation, fundMap: params.fundMap, counts: preview.counts, createdByEmail: params.actor.email } as Prisma.InputJsonValue,
    },
  });
  await prisma.migrationRecord.createMany({
    data: preview.rows.map((r) => ({
      migrationJobId: job.id,
      churchId: params.churchId,
      entityType: RECURRING_ENTITY_TYPE,
      rowNumber: r.rowNumber,
      rawDataJson: r as unknown as Prisma.InputJsonValue,
      fingerprint: r.fingerprint,
      status: r.status,
    })),
  });
  await logDashboardAction({
    churchId: params.churchId,
    actorUserId: params.actor.userId,
    actorEmail: params.actor.email,
    actorRole: params.actor.role,
    action: "migration.recurring_job_created",
    entityType: "migration_job",
    entityId: job.id,
    metadata: { rows: preview.counts, importable: importable.length },
  });
  return { jobId: job.id, importable: importable.length };
}

// ---------------------------------------------------------------------------------------------------------------
// Progress

export async function getRecurringJobProgress(jobId: string, churchId: string): Promise<RecurringJobProgress | null> {
  const job = await prisma.migrationJob.findFirst({ where: { id: jobId, churchId, sourceSystem: RECURRING_SOURCE_SYSTEM, status: { notIn: SUBMISSION_JOB_STATUSES } }, select: { id: true, status: true, totalRecords: true } });
  if (!job) return null;
  const grouped = await prisma.migrationRecord.groupBy({ by: ["status"], where: { migrationJobId: jobId }, _count: { _all: true } });
  const counts: Record<string, number> = {};
  for (const g of grouped) counts[g.status] = g._count._all;
  const remaining = (counts.VALID ?? 0) + (counts.WARNING ?? 0) + (counts.IMPORTING ?? 0);
  return { jobId, status: job.status, total: job.totalRecords, counts, remaining, done: remaining === 0 };
}

async function finishIfDone(jobId: string, churchId: string): Promise<RecurringJobProgress> {
  const progress = (await getRecurringJobProgress(jobId, churchId))!;
  if (progress.done && !["COMPLETED", "COMPLETED_WITH_ERRORS", "CANCELLED"].includes(progress.status)) {
    const problems = (progress.counts.FAILED ?? 0) + (progress.counts.NEEDS_REVIEW ?? 0);
    const status = problems > 0 ? "COMPLETED_WITH_ERRORS" : "COMPLETED";
    await prisma.migrationJob.update({
      where: { id: jobId },
      data: { status, completedAt: new Date(), processedRecords: progress.counts.IMPORTED ?? 0, succeededRecords: progress.counts.IMPORTED ?? 0, failedRecords: problems },
    });
    return { ...progress, status };
  }
  return progress;
}

// ---------------------------------------------------------------------------------------------------------------
// Run one chunk

async function failRecord(recordId: string, jobId: string, churchId: string, rowNumber: number, message: string, status: RecurringRecordStatus = "FAILED") {
  await prisma.migrationRecord.update({ where: { id: recordId }, data: { status } });
  await prisma.migrationError.create({ data: { migrationJobId: jobId, churchId, entityType: RECURRING_ENTITY_TYPE, rowNumber, message: message.slice(0, 500) } });
}

export async function processRecurringImportChunk(jobId: string, churchId: string, actor: ImportActor, opts: { limit?: number; now?: Date } = {}): Promise<RecurringJobProgress> {
  const job = await prisma.migrationJob.findFirst({ where: { id: jobId, churchId, sourceSystem: RECURRING_SOURCE_SYSTEM, status: { notIn: SUBMISSION_JOB_STATUSES } } });
  if (!job) throw new Error("Import job not found.");
  if (["COMPLETED", "COMPLETED_WITH_ERRORS", "CANCELLED", "FAILED"].includes(job.status)) return (await getRecurringJobProgress(jobId, churchId))!;

  // The organization must still be approved and have its Finix merchant, checked on every chunk.
  await assertNonprofitApproved(churchId);
  const full = await prisma.church.findUnique({ where: { id: churchId }, select: { id: true, name: true, finixMerchantId: true } });
  if (!full?.finixMerchantId) throw new Error("This organization is not fully onboarded with Finix.");

  if (job.status !== "IMPORTING") await prisma.migrationJob.update({ where: { id: jobId }, data: { status: "IMPORTING", startedAt: job.startedAt ?? new Date() } });

  const now = opts.now ?? new Date();
  const records = await prisma.migrationRecord.findMany({
    where: { migrationJobId: jobId, churchId, status: { in: ["VALID", "WARNING"] } },
    orderBy: { rowNumber: "asc" },
    take: opts.limit ?? PROCESS_CHUNK_SIZE,
  });

  for (const record of records) {
    // Claim the row; if another request got it first, skip it.
    const claimed = await prisma.migrationRecord.updateMany({ where: { id: record.id, status: { in: ["VALID", "WARNING"] } }, data: { status: "IMPORTING" } });
    if (claimed.count !== 1) continue;
    try {
      await importOneRow({ record, row: record.rawDataJson as unknown as RecurringPreviewRow, job, church: { id: churchId, name: full.name, finixMerchantId: full.finixMerchantId }, actor, now });
    } catch (err) {
      await failRecord(record.id, jobId, churchId, record.rowNumber, err instanceof Error ? err.message : "Unknown error");
    }
  }
  return finishIfDone(jobId, churchId);
}

async function importOneRow(ctx: {
  record: { id: string; rowNumber: number; fingerprint: string };
  row: RecurringPreviewRow;
  job: { id: string; createdByUserId: string | null };
  church: { id: string; name: string; finixMerchantId: string };
  actor: ImportActor;
  now: Date;
}): Promise<void> {
  const { record, row, job, church, actor } = ctx;
  const idempotencyKey = `migration:${job.id}:${record.rowNumber}`;
  const fail = (message: string, status: RecurringRecordStatus = "FAILED") => failRecord(record.id, job.id, church.id, record.rowNumber, message, status);

  // 1. A row that was already imported in another job is skipped.
  const dupe = await prisma.migrationRecord.findFirst({ where: { churchId: church.id, entityType: RECURRING_ENTITY_TYPE, fingerprint: record.fingerprint, status: "IMPORTED", id: { not: record.id } }, select: { id: true } });
  if (dupe) {
    await prisma.migrationRecord.update({ where: { id: record.id }, data: { status: "DUPLICATE" } });
    return;
  }

  // 2. An earlier attempt of this same row: finished -> reuse it; unfinished -> hold for a person to check Finix.
  const prior = await prisma.subscriptionAction.findUnique({ where: { idempotencyKey } });
  if (prior) {
    if (prior.state === "COMPLETED") {
      const done = prior.newValue as { id?: string } | null;
      await prisma.migrationRecord.update({ where: { id: record.id }, data: { status: "IMPORTED", resultEntityId: done?.id ?? null } });
      return;
    }
    if (prior.state === "PENDING") {
      await fail("An earlier attempt for this row did not finish. Check Finix for a subscription on this card before retrying; nothing was created again.", "NEEDS_REVIEW");
      return;
    }
  }

  if (!row.finixInstrumentId || !row.finixIdentityId || !row.frequency || row.amountCents == null || row.trialDays == null || !row.nextChargeDate) {
    await fail("The row is missing data that the preview required.");
    return;
  }
  // The first charge must still be in the future today (a job can sit for a day).
  const daysNow = daysBetween(todayUtc(ctx.now), row.nextChargeDate);
  if (daysNow < 1) {
    await fail(`The first charge date ${row.nextChargeDate} is no longer in the future. Fix the date and import again.`);
    return;
  }

  // 3. The imported instrument: read it from Finix, check it belongs to the identity in the mapping file.
  await syncPaymentInstrument(row.finixInstrumentId, { churchId: church.id });
  const instrument = await prisma.finixPaymentInstrumentSnapshot.findUnique({ where: { finixPaymentInstrumentId: row.finixInstrumentId } });
  if (!instrument) {
    await fail("Finix has no payment instrument with this ID.");
    return;
  }
  if (instrument.churchId && instrument.churchId !== church.id) {
    await fail("This payment instrument is already linked to another organization.");
    return;
  }
  if (instrument.finixIdentityId !== row.finixIdentityId) {
    await fail("The instrument belongs to a different Finix identity than the mapping file says.");
    return;
  }
  if (instrument.enabled === false || (instrument.state ?? "").toUpperCase() === "DELETED") {
    await fail("This payment instrument is disabled or deleted in Finix.");
    return;
  }
  if (instrument.cardExpirationMonth && instrument.cardExpirationYear && new Date(instrument.cardExpirationYear, instrument.cardExpirationMonth, 1) < ctx.now) {
    await fail("This card has expired.");
    return;
  }

  // 4. The donor: the one matched from the Finix identity, else found or created from the schedule row.
  let donorId = instrument.donorId;
  if (!donorId) {
    if (!row.donorName && !row.donorEmail) {
      await fail("No donor could be matched from the Finix identity, and the row has no name or email.");
      return;
    }
    const donor = await resolveOrCreateDonor({ churchId: church.id, finixIdentityId: row.finixIdentityId, name: row.donorName, email: row.donorEmail });
    donorId = donor.id;
  }
  await prisma.finixPaymentInstrumentSnapshot.update({ where: { finixPaymentInstrumentId: instrument.finixPaymentInstrumentId }, data: { churchId: church.id, donorId, instrumentUse: instrument.instrumentUse ?? "subscription_billing" } });
  const donor = await prisma.donor.findFirst({ where: { id: donorId, churchId: church.id, archivedAt: null } });
  if (!donor) {
    await fail("The matched donor is archived or belongs to another organization.");
    return;
  }

  // 5. Mark the attempt BEFORE calling Finix, so a crash in between is visible and never retried blindly.
  await prisma.subscriptionAction.create({
    data: { churchId: church.id, finixSubscriptionId: "pending", actionType: "CREATE", idempotencyKey, requestedByUserId: actor.userId, newValue: { donorId, amountCents: row.amountCents, billingInterval: row.frequency, migration: true }, state: "PENDING" },
  });

  // 6. Create the subscription in Finix with a trial that ends on the first charge date.
  let finixSub: Record<string, any> | null = null;
  try {
    finixSub = await finixClient.createSubscription({
      amount: row.amountCents,
      currency: "USD",
      billing_interval: row.frequency,
      linked_to: church.finixMerchantId,
      linked_type: "MERCHANT",
      buyer_details: { identity_id: row.finixIdentityId, instrument_id: row.finixInstrumentId },
      subscription_details: { collection_method: "BILL_AUTOMATICALLY", trial_details: { interval_type: "DAY", interval_count: daysNow } },
      tags: { source: "wgc_recurring_migration", churchId: church.id, donorId, migrationJobId: job.id, migrationRow: String(record.rowNumber) },
    });
  } catch (err) {
    await prisma.subscriptionAction.update({ where: { idempotencyKey }, data: { state: "FAILED", failureReason: err instanceof Error ? err.message : "Finix error" } });
    await fail(`Finix did not create the subscription: ${err instanceof Error ? err.message : "unknown error"}`);
    return;
  }
  if (!finixSub?.id) {
    await prisma.subscriptionAction.update({ where: { idempotencyKey }, data: { state: "FAILED", failureReason: "No subscription ID returned" } });
    await fail("Finix did not return a subscription ID.");
    return;
  }

  // 7. Check the first charge date Finix reports. A wrong date means a donor could be charged early or late: cancel it.
  const firstCharge = parseFinixDate(finixSub.first_charge_at) ?? parseFinixDate(finixSub.next_billing_date);
  const expected = new Date(`${row.nextChargeDate}T00:00:00Z`);
  const offDays = firstCharge ? Math.abs(Math.round((firstCharge.getTime() - expected.getTime()) / 86_400_000)) : null;
  if (!firstCharge || offDays == null || offDays > FIRST_CHARGE_TOLERANCE_DAYS) {
    try {
      await finixClient.cancelSubscription(finixSub.id);
    } catch {
      // reported below; staff can cancel it in Finix by ID
    }
    await prisma.subscriptionAction.update({ where: { idempotencyKey }, data: { state: "FAILED", finixSubscriptionId: finixSub.id, failureReason: "First charge date did not match; canceled" } });
    await fail(`Finix scheduled the first charge for ${firstCharge ? firstCharge.toISOString().slice(0, 10) : "an unknown date"}, not ${row.nextChargeDate}. The subscription ${finixSub.id} was canceled so no one is charged on the wrong day.`);
    return;
  }

  // 8. Save everything in one database transaction (Finix is already done).
  const donorName = donor.anonymousPreference ? "Anonymous Donor" : formatPersonName(donor.name);
  try {
    const saved = await prisma.$transaction(async (tx) => {
      const sub = await tx.finixSubscription.create({
        data: {
          finixSubscriptionId: finixSub!.id,
          churchId: church.id,
          donorId,
          fundId: row.fundId,
          attributedUserId: null,
          finixMerchantId: church.finixMerchantId,
          finixBuyerIdentityId: row.finixIdentityId,
          finixPaymentInstrumentId: row.finixInstrumentId,
          state: finixSub!.state ?? "ACTIVE",
          amountCents: row.amountCents!,
          currency: "USD",
          billingInterval: row.frequency!,
          collectionMethod: "BILL_AUTOMATICALLY",
          nextBillingDate: firstCharge,
          startedAt: ctx.now,
          createdByUserId: actor.userId,
          consentSource: "MIGRATED",
          lastSyncedAt: ctx.now,
          isPledge: false,
        },
      });
      await tx.subscriptionConsent.create({
        data: {
          churchId: church.id,
          donorId,
          finixSubscriptionId: finixSub!.id,
          consentSource: "MIGRATED",
          confirmedByUserId: actor.userId,
          termsVersion: RECURRING_TERMS_VERSION,
          recurringTermsSnapshot: { migratedFrom: RECURRING_SOURCE_SYSTEM, externalCustomerId: row.externalCustomerId, originalTokenId: row.originalTokenId, amountCents: row.amountCents, billingInterval: row.frequency, firstChargeDate: row.nextChargeDate, fundId: row.fundId, migrationJobId: job.id },
          donorNameSnapshot: donorName,
          donorEmailSnapshot: donor.email,
          amountCentsSnapshot: row.amountCents!,
          frequencySnapshot: row.frequency!,
          startDateSnapshot: ctx.now,
          paymentMethodLastFourSnapshot: instrument.cardLast4 || instrument.bankLast4 || null,
          organizationNameSnapshot: church.name,
        },
      });
      await tx.subscriptionAction.update({ where: { idempotencyKey }, data: { state: "COMPLETED", finixSubscriptionId: finixSub!.id, newValue: { id: sub.id, finixSubscriptionId: finixSub!.id, donorId, amountCents: row.amountCents, billingInterval: row.frequency }, completedAt: new Date() } });
      await tx.migrationRecord.update({ where: { id: record.id }, data: { status: "IMPORTED", resultEntityId: sub.id } });
      return sub;
    });
    await logDashboardAction({ churchId: church.id, actorUserId: actor.userId, actorEmail: actor.email, actorRole: actor.role, action: "migration.recurring_row_imported", entityType: "subscription", entityId: saved.id, metadata: { jobId: job.id, row: record.rowNumber, finixSubscriptionId: finixSub.id, firstChargeDate: row.nextChargeDate } });
    try {
      await emitEvent({ type: "recurring.created", churchId: church.id, data: { finixSubscriptionId: finixSub.id, donorId, amountCents: row.amountCents, billingInterval: row.frequency, migrated: true } });
    } catch (err) {
      console.error("Failed to emit recurring.created for a migrated subscription:", err);
    }
  } catch (err) {
    // Finix has the subscription but our save failed: say so loudly, so staff can fix or cancel it by ID.
    await prisma.subscriptionAction.update({ where: { idempotencyKey }, data: { state: "FAILED", finixSubscriptionId: finixSub.id, failureReason: "Created in Finix but not saved in WGC" } }).catch(() => undefined);
    await fail(`Created in Finix as ${finixSub.id} but could not be saved in WGC (${err instanceof Error ? err.message : "database error"}). Cancel it in Finix or contact support; do not import this row again.`, "NEEDS_REVIEW");
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Undo: cancel what a job created

export async function cancelImportedSubscriptions(jobId: string, churchId: string, actor: ImportActor, reason: string, opts: { limit?: number } = {}): Promise<{ canceled: number; failed: number; remaining: number }> {
  const job = await prisma.migrationJob.findFirst({ where: { id: jobId, churchId, sourceSystem: RECURRING_SOURCE_SYSTEM, status: { notIn: SUBMISSION_JOB_STATUSES } }, select: { id: true } });
  if (!job) throw new Error("Import job not found.");
  const records = await prisma.migrationRecord.findMany({ where: { migrationJobId: jobId, churchId, status: "IMPORTED", resultEntityId: { not: null } }, orderBy: { rowNumber: "asc" }, take: opts.limit ?? 20 });
  let canceled = 0;
  let failed = 0;
  for (const record of records) {
    const sub = await prisma.finixSubscription.findFirst({ where: { id: record.resultEntityId!, churchId } });
    if (!sub) {
      await prisma.migrationRecord.update({ where: { id: record.id }, data: { status: "ROLLED_BACK" } });
      continue;
    }
    try {
      if (!sub.canceledAt) await finixClient.cancelSubscription(sub.finixSubscriptionId);
      await prisma.finixSubscription.update({ where: { id: sub.id }, data: { canceledAt: sub.canceledAt ?? new Date(), cancelReason: `Import rolled back: ${reason}`.slice(0, 500), canceledByUserId: actor.userId, state: "CANCELED", lastSyncedAt: new Date() } });
      await prisma.migrationRecord.update({ where: { id: record.id }, data: { status: "ROLLED_BACK" } });
      canceled++;
      await logDashboardAction({ churchId, actorUserId: actor.userId, actorEmail: actor.email, actorRole: actor.role, action: "migration.recurring_row_rolled_back", entityType: "subscription", entityId: sub.id, metadata: { jobId, reason } });
      try {
        await emitEvent({ type: "recurring.cancelled", churchId, data: { finixSubscriptionId: sub.finixSubscriptionId, donorId: sub.donorId, reason: `Import rolled back: ${reason}` } });
      } catch (err) {
        console.error("Failed to emit recurring.cancelled for a rolled-back subscription:", err);
      }
    } catch (err) {
      failed++;
      await prisma.migrationError.create({ data: { migrationJobId: jobId, churchId, entityType: RECURRING_ENTITY_TYPE, rowNumber: record.rowNumber, message: `Could not cancel ${sub.finixSubscriptionId}: ${err instanceof Error ? err.message : "error"}`.slice(0, 500) } });
    }
  }
  const remaining = await prisma.migrationRecord.count({ where: { migrationJobId: jobId, status: "IMPORTED" } });
  if (remaining === 0) await prisma.migrationJob.update({ where: { id: jobId }, data: { status: "CANCELLED" } });
  return { canceled, failed, remaining };
}

// ---------------------------------------------------------------------------------------------------------------
// Report

export async function getRecurringImportReport(jobId: string, churchId: string) {
  const job = await prisma.migrationJob.findFirst({ where: { id: jobId, churchId, sourceSystem: RECURRING_SOURCE_SYSTEM, status: { notIn: SUBMISSION_JOB_STATUSES } } });
  if (!job) return null;
  const [records, errors] = await Promise.all([
    prisma.migrationRecord.findMany({ where: { migrationJobId: jobId }, orderBy: { rowNumber: "asc" } }),
    prisma.migrationError.findMany({ where: { migrationJobId: jobId }, orderBy: { createdAt: "asc" } }),
  ]);
  const subIds = records.map((r) => r.resultEntityId).filter((x): x is string => !!x);
  const subs = subIds.length ? await prisma.finixSubscription.findMany({ where: { id: { in: subIds }, churchId }, select: { id: true, finixSubscriptionId: true } }) : [];
  const subMap = new Map(subs.map((s) => [s.id, s.finixSubscriptionId]));
  const errorByRow = new Map<number, string>();
  for (const e of errors) errorByRow.set(e.rowNumber, e.message);
  const rows = records.map((r) => {
    const raw = r.rawDataJson as unknown as RecurringPreviewRow;
    return {
      rowNumber: r.rowNumber,
      status: r.status,
      externalCustomerId: raw.externalCustomerId,
      donorName: raw.donorName,
      amountCents: raw.amountCents,
      frequency: raw.frequency,
      nextChargeDate: raw.nextChargeDate,
      fundName: raw.fundName,
      finixIdentityId: raw.finixIdentityId,
      finixInstrumentId: raw.finixInstrumentId,
      finixSubscriptionId: r.resultEntityId ? subMap.get(r.resultEntityId) ?? null : null,
      message: errorByRow.get(r.rowNumber) ?? (raw.messages ?? []).join(" "),
    };
  });
  return { job: { id: job.id, status: job.status, fileName: job.fileName, createdAt: job.createdAt, startedAt: job.startedAt, completedAt: job.completedAt, sourceData: job.sourceDataJson }, rows };
}

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export interface RecurringReportRow {
  rowNumber: number;
  status: string;
  externalCustomerId: string;
  donorName: string | null;
  amountCents: number | null;
  frequency: string | null;
  nextChargeDate: string | null;
  fundName: string | null;
  finixIdentityId: string | null;
  finixInstrumentId: string | null;
  finixSubscriptionId: string | null;
  message: string;
}

export function recurringReportCsv(rows: RecurringReportRow[]): string {
  const header = ["row", "status", "customer_id", "donor", "amount", "frequency", "first_charge_date", "fund", "finix_identity_id", "finix_instrument_id", "finix_subscription_id", "message"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push([r.rowNumber, r.status, r.externalCustomerId, r.donorName, r.amountCents == null ? "" : (r.amountCents / 100).toFixed(2), r.frequency, r.nextChargeDate, r.fundName, r.finixIdentityId, r.finixInstrumentId, r.finixSubscriptionId, r.message].map(csvCell).join(","));
  }
  return lines.join("\n");
}

/** Which subscriptions on a page came from a migration (for the "Migrated" tag). */
export async function getMigratedSubscriptionIds(churchId: string, subscriptionIds: string[]): Promise<Set<string>> {
  if (subscriptionIds.length === 0) return new Set();
  const rows = await prisma.migrationRecord.findMany({
    where: { churchId, entityType: RECURRING_ENTITY_TYPE, status: { in: ["IMPORTED", "ROLLED_BACK"] }, resultEntityId: { in: subscriptionIds } },
    select: { resultEntityId: true },
  });
  return new Set(rows.map((r) => r.resultEntityId).filter((x): x is string => !!x));
}
