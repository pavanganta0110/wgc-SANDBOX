import { prisma } from "@/lib/prisma";
import { generateYearEndStatement, sendYearEndStatementEmail } from "@/lib/donors/generateStatement";

export const BULK_JOB_CHUNK_SIZE = 5;

export interface BulkStatementJobView {
  id: string;
  jobType: "GENERATE" | "SEND";
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  totalCount: number;
  processedCount: number;
  succeededCount: number;
  failedCount: number;
  needsReviewCount: number;
  skippedCount: number;
}

function toView(job: {
  id: string;
  jobType: string;
  status: string;
  totalCount: number;
  processedCount: number;
  succeededCount: number;
  failedCount: number;
  needsReviewCount: number;
  skippedCount: number;
}): BulkStatementJobView {
  return {
    id: job.id,
    jobType: job.jobType as "GENERATE" | "SEND",
    status: job.status as BulkStatementJobView["status"],
    totalCount: job.totalCount,
    processedCount: job.processedCount,
    succeededCount: job.succeededCount,
    failedCount: job.failedCount,
    needsReviewCount: job.needsReviewCount,
    skippedCount: job.skippedCount,
  };
}

/** Creates a job row only — does not process any items. The caller drives progress by repeatedly calling processBulkStatementJobChunk. */
export async function createBulkStatementJob(
  churchId: string,
  taxYear: number,
  jobType: "GENERATE" | "SEND",
  targetIds: string[],
  createdByUserId: string | null,
): Promise<BulkStatementJobView> {
  const job = await prisma.bulkStatementJob.create({
    data: {
      churchId,
      taxYear,
      jobType,
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
 * slice starting at the current processedCount cursor.
 */
export async function processBulkStatementJobChunk(jobId: string, churchId: string, actorEmail: string | null): Promise<BulkStatementJobView> {
  const job = await prisma.bulkStatementJob.findFirst({ where: { id: jobId, churchId } });
  if (!job) throw new Error("Job not found");
  if (job.status === "COMPLETED" || job.status === "FAILED") return toView(job);

  const targetIds = job.targetIds as string[];
  const chunk = targetIds.slice(job.processedCount, job.processedCount + BULK_JOB_CHUNK_SIZE);

  let succeededDelta = 0;
  let failedDelta = 0;
  let needsReviewDelta = 0;
  let skippedDelta = 0;

  for (const id of chunk) {
    if (job.jobType === "GENERATE") {
      try {
        const result = await generateYearEndStatement(id, churchId, job.taxYear, job.createdByUserId);
        succeededDelta += 1;
        if (result.status === "NEEDS_REVIEW") needsReviewDelta += 1;
      } catch {
        failedDelta += 1;
      }
    } else {
      const statement = await prisma.annualDonationStatement.findFirst({ where: { id, churchId } });
      if (!statement) {
        failedDelta += 1;
        continue;
      }
      if (statement.statementStatus === "NEEDS_REVIEW") {
        skippedDelta += 1;
        continue;
      }
      try {
        await sendYearEndStatementEmail(id, churchId, actorEmail);
        succeededDelta += 1;
      } catch {
        failedDelta += 1;
      }
    }
  }

  const processedCount = job.processedCount + chunk.length;
  const done = processedCount >= job.totalCount;

  const updated = await prisma.bulkStatementJob.update({
    where: { id: job.id },
    data: {
      processedCount,
      succeededCount: job.succeededCount + succeededDelta,
      failedCount: job.failedCount + failedDelta,
      needsReviewCount: job.needsReviewCount + needsReviewDelta,
      skippedCount: job.skippedCount + skippedDelta,
      status: done ? "COMPLETED" : "RUNNING",
      completedAt: done ? new Date() : null,
    },
  });

  return toView(updated);
}
