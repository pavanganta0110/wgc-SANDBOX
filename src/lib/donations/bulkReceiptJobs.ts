import { prisma } from "@/lib/prisma";
import { sendExternalDonationReceiptEmail } from "@/lib/donations/sendExternalDonationReceiptEmail";

export const BULK_RECEIPT_JOB_CHUNK_SIZE = 5;

export interface BulkReceiptJobView {
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
}): BulkReceiptJobView {
  return {
    id: job.id,
    status: job.status as BulkReceiptJobView["status"],
    totalCount: job.totalCount,
    processedCount: job.processedCount,
    succeededCount: job.succeededCount,
    failedCount: job.failedCount,
    skippedCount: job.skippedCount,
  };
}

/**
 * Creates a job for every ExternalDonation currently QUEUED for this church
 * — does not send anything. The caller drives progress by repeatedly
 * calling processBulkReceiptJobChunk while status is PENDING/RUNNING.
 */
export async function createBulkReceiptJob(churchId: string, createdByUserId: string | null): Promise<BulkReceiptJobView> {
  const queued = await prisma.externalDonation.findMany({
    where: { churchId, receiptStatus: "QUEUED", status: { not: "VOIDED" } },
    select: { id: true },
  });
  const targetIds = queued.map((d) => d.id);

  const job = await prisma.bulkReceiptJob.create({
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
 * processedCount. Idempotent to call again after COMPLETED (no-op). Never
 * processes the same ID twice within a job — each call only looks at the
 * slice starting at the current processedCount cursor. A row whose
 * receiptStatus has since moved off QUEUED (e.g. sent individually from the
 * donation detail page while this job was pending) is skipped, not failed.
 */
export async function processBulkReceiptJobChunk(jobId: string, churchId: string, actorUserId: string | null): Promise<BulkReceiptJobView> {
  const job = await prisma.bulkReceiptJob.findFirst({ where: { id: jobId, churchId } });
  if (!job) throw new Error("Job not found");
  if (job.status === "COMPLETED" || job.status === "FAILED") return toView(job);

  const targetIds = job.targetIds as string[];
  const chunk = targetIds.slice(job.processedCount, job.processedCount + BULK_RECEIPT_JOB_CHUNK_SIZE);

  let succeededDelta = 0;
  let failedDelta = 0;
  let skippedDelta = 0;

  for (const id of chunk) {
    const donation = await prisma.externalDonation.findFirst({ where: { id, churchId }, select: { receiptStatus: true } });
    if (!donation || donation.receiptStatus !== "QUEUED") {
      skippedDelta += 1;
      continue;
    }
    try {
      const result = await sendExternalDonationReceiptEmail(id, churchId, actorUserId);
      if (result.success) succeededDelta += 1;
      else failedDelta += 1;
    } catch {
      failedDelta += 1;
    }
  }

  const processedCount = job.processedCount + chunk.length;
  const done = processedCount >= job.totalCount;

  const updated = await prisma.bulkReceiptJob.update({
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
