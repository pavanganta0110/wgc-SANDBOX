import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";
import { JOB_CONFIGS, isActivelyScheduled, isRetrySafe } from "@/lib/monitoring/jobCadence";

interface JobRow {
  jobName: string;
  label: string;
  jobType: string;
  critical: boolean;
  retrySafe: boolean;
  activelyScheduled: boolean;
  status: "NEVER_RUN" | "HEALTHY" | "STALE" | "FAILED" | "PARTIALLY_FAILED";
  lastRun: {
    id: string;
    status: string;
    startedAt: Date;
    completedAt: Date | null;
    durationMs: number | null;
    processedCount: number | null;
    successCount: number | null;
    failedCount: number | null;
    retryCount: number;
    merchantId: string | null;
  } | null;
  lastSuccessfulRunAt: Date | null;
  nextExpectedRunAt: Date | null;
}

/**
 * Global-admin-only. One row per job in the centralized JOB_CONFIGS registry
 * (jobCadence.ts) — including aplos-sync, which exists as code but isn't
 * actively scheduled yet (see that job's own comment) — never rows invented
 * from JobRun alone, so a job that has genuinely never run still shows up as
 * "Never Run" instead of silently disappearing from this list.
 */
export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jobNames = Object.keys(JOB_CONFIGS);

  const rows: JobRow[] = await Promise.all(
    jobNames.map(async (jobName): Promise<JobRow> => {
      const config = JOB_CONFIGS[jobName];
      const scheduled = isActivelyScheduled(jobName);

      const [lastRun, lastSuccess] = await Promise.all([
        prisma.jobRun.findFirst({ where: { jobName }, orderBy: { startedAt: "desc" } }),
        prisma.jobRun.findFirst({ where: { jobName, status: "SUCCEEDED" }, orderBy: { completedAt: "desc" }, select: { completedAt: true } }),
      ]);

      const isStale = scheduled && (!lastSuccess?.completedAt || Date.now() - lastSuccess.completedAt.getTime() > config.staleAfterMs);
      const lastRunFailed = lastRun?.status === "FAILED" || lastRun?.status === "PARTIALLY_FAILED";

      let status: JobRow["status"] = "HEALTHY";
      if (!lastRun) status = "NEVER_RUN";
      else if (isStale) status = "STALE";
      else if (lastRunFailed) status = lastRun.status as "FAILED" | "PARTIALLY_FAILED";

      return {
        jobName,
        label: config.label,
        jobType: config.jobType,
        critical: config.critical,
        retrySafe: isRetrySafe(jobName),
        activelyScheduled: scheduled,
        status,
        lastRun: lastRun
          ? {
              id: lastRun.id,
              status: lastRun.status,
              startedAt: lastRun.startedAt,
              completedAt: lastRun.completedAt,
              durationMs: lastRun.durationMs,
              processedCount: lastRun.processedCount,
              successCount: lastRun.successCount,
              failedCount: lastRun.failedCount,
              retryCount: lastRun.retryCount,
              merchantId: lastRun.merchantId,
            }
          : null,
        lastSuccessfulRunAt: lastSuccess?.completedAt ?? null,
        // An estimate only (last run's start + configured interval) — this
        // codebase has no single source that can derive the *exact* next
        // Vercel cron fire time from vercel.json at runtime (see
        // jobCadence.ts's own comment on why cadence is hand-copied there).
        nextExpectedRunAt: scheduled && lastRun ? new Date(lastRun.startedAt.getTime() + config.expectedIntervalMs) : null,
      };
    })
  );

  // Unhealthy jobs first (critical problems before non-critical ones), then
  // never-run, then healthy — so an admin sees real problems immediately
  // without needing to sort or filter.
  function rank(r: JobRow): number {
    if (r.status === "HEALTHY") return 3;
    if (r.status === "NEVER_RUN") return 2;
    return r.critical ? 0 : 1;
  }
  rows.sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));

  return NextResponse.json({ jobs: rows });
}
