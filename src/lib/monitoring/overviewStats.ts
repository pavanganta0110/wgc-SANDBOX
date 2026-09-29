import { prisma } from "@/lib/prisma";
import { getAllServiceStatuses, type ServiceStatus } from "./serviceStatus";

export type OverallStatus = "OPERATIONAL" | "DEGRADED" | "MAJOR_ISSUE";

export interface ActiveIssue {
  id: string;
  title: string;
  service: string;
  severity: string;
  status: string;
  startedAt: Date;
  lastSeenAt: Date;
  occurrenceCount: number;
  affectedMerchantCount: number;
}

export interface SystemHealthOverview {
  overallStatus: OverallStatus;
  activeErrors: number;
  activeIncidents: number;
  affectedMerchants: number;
  /** null = Unknown (no job-run history exists yet — see serviceStatus.ts). */
  failedJobs: number | null;
  failedWebhooks: number | null;
  /** null = Unknown (no requests in window, or nothing to measure from). Percentage, 0-100. Scoped to the /api/v1 partner API only — see ApiRequestLog. */
  apiErrorRatePercent: number | null;
  /** null = Unknown (no requests with a recorded duration in window). Scoped to the /api/v1 partner API only, NOT whole-platform latency — see withApiAuth.ts, which is the only place this is measured. */
  averageApiResponseTimeMs: number | null;
  lastDeployment: { commitSha: string | null; commitMessage: string | null; commitRef: string | null; environment: string | null } | null;
  services: ServiceStatus[];
  /**
   * Every currently-open SystemIncident (OPEN/INVESTIGATING/MONITORING),
   * most severe and most recent first — this IS the "Active Incidents"
   * count above, just expanded into a list, so a reader never needs to
   * cross-reference two different queries to see what's actually wrong.
   * Deliberately not a second, independently-computed list of "problems"
   * (e.g. re-deriving issues from raw error groups) — that would risk
   * showing the same underlying incident twice under two different labels.
   */
  activeIssues: ActiveIssue[];
  /**
   * Real donation/payment volume, read-only off the existing PaymentAttempt
   * table (written by the checkout flow regardless of monitoring) — never a
   * new write on the payment hot path itself, so this can never be the
   * thing that makes checkout slower under real load. This is the direct
   * answer to "if a lot of people check out at once, would we even know" —
   * attemptsLast5Min is the closest thing to "how busy is checkout right
   * now"; the last-hour figures show whether volume is coming with a
   * healthy success rate or not.
   */
  checkoutThroughput: {
    attemptsLast5Min: number;
    attemptsLastHour: number;
    succeededLastHour: number;
    failedLastHour: number;
    /** null = Unknown (no attempts in the window to compute a rate from). */
    successRatePercent: number | null;
  };
}

const SEVERITY_RANK: Record<string, number> = { CRITICAL: 0, ERROR: 1, WARNING: 2, INFO: 3 };

function computeOverallStatus(services: ServiceStatus[], hasCriticalIncident: boolean): OverallStatus {
  if (hasCriticalIncident || services.some((s) => s.status === "OUTAGE")) return "MAJOR_ISSUE";
  if (services.some((s) => s.status === "DEGRADED")) return "DEGRADED";
  return "OPERATIONAL";
}

export async function getSystemHealthOverview(): Promise<SystemHealthOverview> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const since1h = new Date(Date.now() - 60 * 60 * 1000);
  const since5min = new Date(Date.now() - 5 * 60 * 1000);

  const [services, activeErrors, openIncidents, criticalIncidentCount, affectedMerchantRows, apiRequestStats] = await Promise.all([
    getAllServiceStatuses(),
    prisma.systemErrorGroup.count({ where: { status: "OPEN" } }),
    prisma.systemIncident.findMany({
      where: { status: { in: ["OPEN", "INVESTIGATING", "MONITORING"] } },
      select: { id: true, title: true, service: true, severity: true, status: true, startedAt: true, lastSeenAt: true, occurrenceCount: true, affectedMerchantCount: true },
    }),
    prisma.systemIncident.count({ where: { status: { in: ["OPEN", "INVESTIGATING", "MONITORING"] }, severity: "CRITICAL" } }),
    prisma.systemHealthEvent.findMany({
      where: { merchantId: { not: null }, errorGroup: { status: "OPEN" } },
      distinct: ["merchantId"],
      select: { merchantId: true },
    }),
    // Real, existing data — ApiRequestLog is the per-request log for the
    // authenticated /api/v1 partner API (see src/lib/api/withApiAuth.ts),
    // which as of Phase 3 also measures durationMs per request. _avg over
    // a nullable column skips rows with no recorded duration (requests
    // logged before this field existed) rather than treating them as zero.
    prisma.apiRequestLog.aggregate({
      where: { createdAt: { gte: since24h } },
      _count: { _all: true },
      _avg: { durationMs: true },
    }),
  ]);

  const [attemptsLast5Min, attemptsLastHour, succeededLastHour, failedLastHour] = await Promise.all([
    prisma.paymentAttempt.count({ where: { createdAt: { gte: since5min } } }),
    prisma.paymentAttempt.count({ where: { createdAt: { gte: since1h } } }),
    prisma.paymentAttempt.count({ where: { createdAt: { gte: since1h }, status: "SUCCEEDED" } }),
    prisma.paymentAttempt.count({ where: { createdAt: { gte: since1h }, status: "FAILED" } }),
  ]);
  const resolvedLastHour = succeededLastHour + failedLastHour;

  const failedApiRequests = await prisma.apiRequestLog.count({ where: { createdAt: { gte: since24h }, statusCode: { gte: 500 } } });
  const totalApiRequests = apiRequestStats._count._all;
  const averageDuration = apiRequestStats._avg.durationMs;

  const webhooksService = services.find((s) => s.service === "Webhooks");
  const failedWebhooks = webhooksService && webhooksService.status !== "UNKNOWN" ? webhooksService.recentFailureCount : null;

  // Real as of Phase 4 — reuses backgroundJobsStatus()'s own count of
  // currently-unhealthy actively-scheduled jobs rather than re-querying
  // JobRun a second time here, so this card and the Background Jobs
  // service card can never disagree with each other.
  const backgroundJobsService = services.find((s) => s.service === "Background Jobs");
  const failedJobs = backgroundJobsService && backgroundJobsService.status !== "UNKNOWN" ? backgroundJobsService.recentFailureCount : null;

  const activeIssues: ActiveIssue[] = [...openIncidents]
    .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 4) - (SEVERITY_RANK[b.severity] ?? 4) || b.lastSeenAt.getTime() - a.lastSeenAt.getTime())
    .map((i) => ({
      id: i.id,
      title: i.title,
      service: i.service,
      severity: i.severity,
      status: i.status,
      startedAt: i.startedAt,
      lastSeenAt: i.lastSeenAt,
      occurrenceCount: i.occurrenceCount,
      affectedMerchantCount: i.affectedMerchantCount,
    }));

  return {
    overallStatus: computeOverallStatus(services, criticalIncidentCount > 0),
    activeErrors,
    activeIncidents: openIncidents.length,
    affectedMerchants: affectedMerchantRows.length,
    failedJobs,
    failedWebhooks,
    apiErrorRatePercent: totalApiRequests > 0 ? Math.round((failedApiRequests / totalApiRequests) * 1000) / 10 : null,
    averageApiResponseTimeMs: averageDuration != null ? Math.round(averageDuration) : null,
    lastDeployment:
      process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_REF
        ? {
            commitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
            commitMessage: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? null,
            commitRef: process.env.VERCEL_GIT_COMMIT_REF ?? null,
            environment: process.env.VERCEL_ENV ?? null,
          }
        : null,
    services,
    activeIssues,
    checkoutThroughput: {
      attemptsLast5Min,
      attemptsLastHour,
      succeededLastHour,
      failedLastHour,
      successRatePercent: resolvedLastHour > 0 ? Math.round((succeededLastHour / resolvedLastHour) * 1000) / 10 : null,
    },
  };
}
