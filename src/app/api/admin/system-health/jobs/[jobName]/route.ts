import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";
import { getJobConfig, isActivelyScheduled, isRetrySafe } from "@/lib/monitoring/jobCadence";

const BACKGROUND_JOBS_FINGERPRINT = "Background Jobs:degraded";

/**
 * Global-admin-only. Full detail for one job: its run history plus any
 * SystemHealthEvent rows this job specifically produced (via
 * failJobRun()/markJobPartialFailure() — service="Background Jobs",
 * operation=jobName) and the current Background Jobs incident, but ONLY
 * when this job actually has a health event inside that incident's active
 * window — the incident engine tracks one incident per SERVICE, not per
 * job, so without this check every job would incorrectly appear to have
 * "caused" whatever the Background Jobs incident currently is.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ jobName: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { jobName } = await params;
  const config = getJobConfig(jobName);
  if (!config) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [runs, relatedEvents, incident] = await Promise.all([
    prisma.jobRun.findMany({ where: { jobName }, orderBy: { startedAt: "desc" }, take: 50 }),
    prisma.systemHealthEvent.findMany({
      where: { service: "Background Jobs", operation: jobName },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, createdAt: true, status: true, severity: true, message: true, errorGroupId: true, wgcReference: true, requestId: true },
    }),
    prisma.systemIncident.findUnique({
      where: { fingerprint: BACKGROUND_JOBS_FINGERPRINT },
      select: { id: true, title: true, status: true, severity: true, startedAt: true },
    }),
  ]);

  const lastSuccessfulRun = runs.find((r) => r.status === "SUCCEEDED") ?? null;

  const relatedIncident =
    incident &&
    incident.status !== "RESOLVED" &&
    incident.status !== "IGNORED" &&
    relatedEvents.some((e) => e.createdAt.getTime() >= incident.startedAt.getTime())
      ? { id: incident.id, title: incident.title, status: incident.status, severity: incident.severity }
      : null;

  return NextResponse.json({
    jobName,
    label: config.label,
    jobType: config.jobType,
    critical: config.critical,
    retrySafe: isRetrySafe(jobName),
    activelyScheduled: isActivelyScheduled(jobName),
    expectedIntervalMs: config.expectedIntervalMs,
    staleAfterMs: Number.isFinite(config.staleAfterMs) ? config.staleAfterMs : null,
    lastSuccessfulRunAt: lastSuccessfulRun?.completedAt ?? null,
    runs,
    relatedEvents,
    relatedIncident,
  });
}
