import { prisma } from "@/lib/prisma";

/**
 * Data-retention cleanup for the System Health tables specifically — never
 * touches AuditLog/DashboardAuditLog (a separate, longer-lived retention
 * policy already governs those) or SystemIncident (preserved indefinitely
 * for historical reliability analysis, per the design doc — no retention
 * number was specified for it, so the safe default is "don't delete").
 * Called once daily from /api/cron/system-health-sweep — reuses that
 * existing cron infrastructure rather than adding a dedicated one.
 */

const JOB_RUN_RETENTION_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const ROUTINE_HEALTH_EVENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — INFO/WARNING only
const ERROR_HEALTH_EVENT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000; // 90 days — ERROR/CRITICAL
const ALERT_RETENTION_MS = 180 * 24 * 60 * 60 * 1000; // 180 days

export interface CleanupSummary {
  jobRunsDeleted: number;
  routineHealthEventsDeleted: number;
  errorHealthEventsDeleted: number;
  alertsDeleted: number;
}

export async function cleanupOldMonitoringData(): Promise<CleanupSummary> {
  const now = Date.now();

  const jobRuns = await prisma.jobRun.deleteMany({ where: { startedAt: { lt: new Date(now - JOB_RUN_RETENTION_MS) } } });

  const routineEvents = await prisma.systemHealthEvent.deleteMany({
    where: { severity: { in: ["INFO", "WARNING"] }, createdAt: { lt: new Date(now - ROUTINE_HEALTH_EVENT_RETENTION_MS) } },
  });

  // Never deletes an event still linked to an OPEN/INVESTIGATING/MONITORING
  // incident, regardless of age — that's active evidence, not history.
  const errorEvents = await prisma.systemHealthEvent.deleteMany({
    where: {
      severity: { in: ["ERROR", "CRITICAL"] },
      createdAt: { lt: new Date(now - ERROR_HEALTH_EVENT_RETENTION_MS) },
      OR: [{ errorGroupId: null }, { errorGroup: { incident: null } }, { errorGroup: { incident: { status: "RESOLVED" } } }, { errorGroup: { incident: { status: "IGNORED" } } }],
    },
  });

  const alerts = await prisma.systemAlert.deleteMany({ where: { sentAt: { lt: new Date(now - ALERT_RETENTION_MS) } } });

  return {
    jobRunsDeleted: jobRuns.count,
    routineHealthEventsDeleted: routineEvents.count,
    errorHealthEventsDeleted: errorEvents.count,
    alertsDeleted: alerts.count,
  };
}
