import { prisma } from "@/lib/prisma";
import { syncPaymentToQuickBooks } from "./sync";

export const QUICKBOOKS_BACKFILL_CHUNK_SIZE = 5;

export interface QuickBooksBackfillJobView {
  id: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  totalCount: number;
  processedCount: number;
  succeededCount: number;
  failedCount: number;
  skippedCount: number;
}

function toView(job: {
  id: string;
  status: string;
  totalCount: number;
  processedCount: number;
  succeededCount: number;
  failedCount: number;
  skippedCount: number;
}): QuickBooksBackfillJobView {
  return {
    id: job.id,
    status: job.status as QuickBooksBackfillJobView["status"],
    totalCount: job.totalCount,
    processedCount: job.processedCount,
    succeededCount: job.succeededCount,
    failedCount: job.failedCount,
    skippedCount: job.skippedCount,
  };
}

/**
 * Creates a job for every SUCCEEDED Payment belonging to this church that
 * has no successful QuickBooksSyncRecord yet — covers donations that
 * happened before the church connected QuickBooks (or before automatic
 * sync existed). Does not sync anything itself; the caller drives progress
 * by repeatedly calling processQuickBooksBackfillJobChunk while status is
 * PENDING/RUNNING, same shape as createBulkReceiptJob.
 */
export async function createQuickBooksBackfillJob(churchId: string, createdByUserId: string | null): Promise<QuickBooksBackfillJobView> {
  const alreadySynced = await prisma.quickBooksSyncRecord.findMany({
    where: { churchId, entityType: "PAYMENT", status: "SUCCEEDED" },
    select: { localEntityId: true },
  });
  const syncedIds = new Set(alreadySynced.map((r) => r.localEntityId));

  const succeededPayments = await prisma.payment.findMany({
    where: { churchId, status: "SUCCEEDED" },
    select: { id: true },
  });
  const targetIds = succeededPayments.map((p) => p.id).filter((id) => !syncedIds.has(id));

  const job = await prisma.quickBooksBackfillJob.create({
    data: {
      churchId,
      targetIds,
      totalCount: targetIds.length,
      status: targetIds.length === 0 ? "COMPLETED" : "PENDING",
      completedAt: targetIds.length === 0 ? new Date() : null,
      createdByUserId,
    },
  });
  return toView(job);
}

/**
 * Processes the next chunk of unprocessed target IDs for a job and advances
 * processedCount. Idempotent to call again after COMPLETED (no-op). A
 * payment that's since been synced by some other path (e.g. it happened to
 * fire live while this job was pending) is skipped, not re-synced —
 * syncPaymentToQuickBooks is itself idempotent so this is a defensive
 * double-check, not the only guard.
 */
export async function processQuickBooksBackfillJobChunk(jobId: string, churchId: string): Promise<QuickBooksBackfillJobView> {
  const job = await prisma.quickBooksBackfillJob.findFirst({ where: { id: jobId, churchId } });
  if (!job) throw new Error("Job not found");
  if (job.status === "COMPLETED" || job.status === "FAILED") return toView(job);

  const targetIds = job.targetIds as string[];
  const chunk = targetIds.slice(job.processedCount, job.processedCount + QUICKBOOKS_BACKFILL_CHUNK_SIZE);

  let succeededDelta = 0;
  let failedDelta = 0;
  let skippedDelta = 0;

  for (const paymentId of chunk) {
    const existing = await prisma.quickBooksSyncRecord.findFirst({
      where: { churchId, entityType: "PAYMENT", localEntityId: paymentId },
    });
    if (existing?.status === "SUCCEEDED") {
      skippedDelta += 1;
      continue;
    }
    await syncPaymentToQuickBooks(paymentId);
    const result = await prisma.quickBooksSyncRecord.findFirst({
      where: { churchId, entityType: "PAYMENT", localEntityId: paymentId },
    });
    if (result?.status === "SUCCEEDED") succeededDelta += 1;
    else failedDelta += 1;
  }

  const processedCount = job.processedCount + chunk.length;
  const done = processedCount >= job.totalCount;

  const updated = await prisma.quickBooksBackfillJob.update({
    where: { id: job.id },
    data: {
      processedCount,
      succeededCount: job.succeededCount + succeededDelta,
      failedCount: job.failedCount + failedDelta,
      skippedCount: job.skippedCount + skippedDelta,
      status: done ? "COMPLETED" : "RUNNING",
      completedAt: done ? new Date() : null,
    },
  });

  return toView(updated);
}
