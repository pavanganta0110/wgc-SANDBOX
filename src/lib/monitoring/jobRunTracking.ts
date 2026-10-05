import { prisma } from "@/lib/prisma";
import { recordHealthEvent } from "./healthEvents";
import { getJobConfig } from "./jobCadence";

/**
 * The one standardized job-run monitoring layer every scheduled/background
 * job in this app should go through — startJobRun/completeJobRun/
 * failJobRun/markJobPartialFailure, exactly the shape from the design doc.
 * Reuses the same recordHealthEvent() every other Phase 3 producer calls
 * (service="Background Jobs") for FAILED/PARTIALLY_FAILED outcomes only —
 * never for SUCCEEDED, per the "don't create rows for every success" rule.
 *
 * Every function here is best-effort: a tracking-layer failure (e.g. a
 * transient DB blip while writing the JobRun row) must never fail or delay
 * the actual job it's instrumenting. See withJobRunTracking(), the
 * recommended entry point most cron routes should use instead of calling
 * the four primitives directly.
 */

export type JobRunStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "PARTIALLY_FAILED" | "FAILED" | "RETRYING";

export interface StartJobRunParams {
  jobName: string;
  jobType: string;
  merchantId?: string;
  requestId?: string;
  attempt?: number;
  metadata?: Record<string, unknown>;
}

/** Returns the new run's id, or null if the tracking write itself failed — callers must proceed with the job regardless. */
export async function startJobRun(params: StartJobRunParams): Promise<string | null> {
  try {
    const run = await prisma.jobRun.create({
      data: {
        jobName: params.jobName,
        jobType: params.jobType,
        merchantId: params.merchantId,
        requestId: params.requestId,
        attempt: params.attempt ?? 1,
        status: "RUNNING",
        metadata: params.metadata as never,
      },
      select: { id: true },
    });
    return run.id;
  } catch (err) {
    console.error("[startJobRun] failed to record job start:", err);
    return null;
  }
}

export interface FinishJobRunCounts {
  processedCount?: number;
  successCount?: number;
  failedCount?: number;
  metadata?: Record<string, unknown>;
}

async function updateJobRun(runId: string, status: JobRunStatus, counts: FinishJobRunCounts, errorCode?: string, errorMessage?: string): Promise<void> {
  const run = await prisma.jobRun.findUnique({ where: { id: runId }, select: { startedAt: true } });
  const completedAt = new Date();
  await prisma.jobRun.update({
    where: { id: runId },
    data: {
      status,
      completedAt,
      durationMs: run ? completedAt.getTime() - run.startedAt.getTime() : undefined,
      processedCount: counts.processedCount,
      successCount: counts.successCount,
      failedCount: counts.failedCount,
      metadata: counts.metadata as never,
      lastErrorCode: errorCode,
      lastErrorMessage: errorMessage,
    },
  });
}

/** Marks a run SUCCEEDED. Never records a health event — a successful run is not a meaningful occurrence per the "no noise" rule. */
export async function completeJobRun(params: { runId: string | null } & FinishJobRunCounts): Promise<void> {
  if (!params.runId) return;
  try {
    await updateJobRun(params.runId, "SUCCEEDED", params);
  } catch (err) {
    console.error("[completeJobRun] failed to record job completion:", err);
  }
}

/** Marks a run FAILED and records a Background Jobs health event (severity depends on the job's configured criticality — see jobCadence.ts). */
export async function failJobRun(params: { runId: string | null; errorCode?: string; errorMessage: string } & FinishJobRunCounts): Promise<void> {
  if (!params.runId) return;
  try {
    const run = await prisma.jobRun.findUnique({ where: { id: params.runId }, select: { jobName: true, merchantId: true, requestId: true } });
    await updateJobRun(params.runId, "FAILED", params, params.errorCode, params.errorMessage);
    if (run) {
      const config = getJobConfig(run.jobName);
      void recordHealthEvent({
        service: "Background Jobs",
        operation: run.jobName,
        status: "FAILED",
        severity: config?.critical ? "CRITICAL" : "ERROR",
        merchantId: run.merchantId ?? undefined,
        requestId: run.requestId ?? undefined,
        errorCode: params.errorCode,
        message: params.errorMessage,
        metadata: { runId: params.runId, ...params.metadata },
      });
    }
  } catch (err) {
    console.error("[failJobRun] failed to record job failure:", err);
  }
}

/** Marks a run PARTIALLY_FAILED — some items processed successfully, others didn't. Recorded at WARNING (not ERROR/CRITICAL) unless the failure share is severe, so one bad record in a large batch doesn't read as a full outage. */
export async function markJobPartialFailure(params: { runId: string | null; errorCode?: string; errorMessage?: string } & Required<Pick<FinishJobRunCounts, "processedCount" | "successCount" | "failedCount">> & Pick<FinishJobRunCounts, "metadata">): Promise<void> {
  if (!params.runId) return;
  try {
    const run = await prisma.jobRun.findUnique({ where: { id: params.runId }, select: { jobName: true, merchantId: true, requestId: true } });
    await updateJobRun(params.runId, "PARTIALLY_FAILED", params, params.errorCode, params.errorMessage);
    if (run) {
      const failureShare = params.processedCount > 0 ? params.failedCount / params.processedCount : 0;
      const config = getJobConfig(run.jobName);
      const severity = failureShare >= 0.5 ? (config?.critical ? "CRITICAL" : "ERROR") : "WARNING";
      void recordHealthEvent({
        service: "Background Jobs",
        operation: run.jobName,
        status: "WARNING",
        severity,
        merchantId: run.merchantId ?? undefined,
        requestId: run.requestId ?? undefined,
        errorCode: params.errorCode,
        message: params.errorMessage ?? `${params.failedCount} of ${params.processedCount} items failed`,
        metadata: { runId: params.runId, processedCount: params.processedCount, successCount: params.successCount, failedCount: params.failedCount, ...params.metadata },
      });
    }
  } catch (err) {
    console.error("[markJobPartialFailure] failed to record job partial failure:", err);
  }
}

export interface JobRunSummary extends FinishJobRunCounts {
  errorCode?: string;
}

/**
 * Recommended entry point for a cron route: wraps the job's actual work,
 * starts a JobRun, and finishes it SUCCEEDED/PARTIALLY_FAILED/FAILED based
 * on the counts the work function returns (or FAILED if it throws) — most
 * cron routes should use this instead of calling the four primitives by
 * hand. `fn` throwing is treated as FAILED; a returned failedCount > 0
 * alongside successCount > 0 is PARTIALLY_FAILED; anything else is
 * SUCCEEDED.
 */
export async function withJobRunTracking<T extends JobRunSummary>(params: { jobName: string; jobType: string; merchantId?: string; requestId?: string }, fn: () => Promise<T>): Promise<T> {
  const runId = await startJobRun(params);
  try {
    const result = await fn();
    const processed = result.processedCount ?? 0;
    const succeeded = result.successCount ?? 0;
    const failed = result.failedCount ?? 0;
    if (failed > 0 && succeeded > 0) {
      await markJobPartialFailure({ runId, processedCount: processed, successCount: succeeded, failedCount: failed, errorCode: result.errorCode, metadata: result.metadata });
    } else if (failed > 0 && succeeded === 0 && processed > 0) {
      await failJobRun({ runId, errorCode: result.errorCode, errorMessage: `All ${failed} processed item(s) failed`, ...result });
    } else {
      await completeJobRun({ runId, ...result });
    }
    return result;
  } catch (err) {
    await failJobRun({ runId, errorMessage: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}
