import { prisma } from "@/lib/prisma";
import { getAllServiceStatuses, type ServiceStatus } from "./serviceStatus";

export type OverallStatus = "OPERATIONAL" | "DEGRADED" | "MAJOR_ISSUE";

export interface SystemHealthOverview {
  overallStatus: OverallStatus;
  activeErrors: number;
  activeIncidents: number;
  affectedMerchants: number;
  /** null = Unknown (no job-run history exists yet — see serviceStatus.ts). */
  failedJobs: number | null;
  failedWebhooks: number | null;
  /** null = Unknown (no requests in window, or nothing to measure from). Percentage, 0-100. */
  apiErrorRatePercent: number | null;
  /** Always null today — no request-duration data exists anywhere in the app yet. */
  averageApiResponseTimeMs: null;
  lastDeployment: { commitSha: string | null; commitMessage: string | null; commitRef: string | null; environment: string | null } | null;
  services: ServiceStatus[];
}

function computeOverallStatus(services: ServiceStatus[], hasCriticalIncident: boolean): OverallStatus {
  if (hasCriticalIncident || services.some((s) => s.status === "OUTAGE")) return "MAJOR_ISSUE";
  if (services.some((s) => s.status === "DEGRADED")) return "DEGRADED";
  return "OPERATIONAL";
}

export async function getSystemHealthOverview(): Promise<SystemHealthOverview> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [services, activeErrors, activeIncidents, criticalIncidentCount, affectedMerchantRows, apiRequestStats] = await Promise.all([
    getAllServiceStatuses(),
    prisma.systemErrorGroup.count({ where: { status: "OPEN" } }),
    prisma.systemIncident.count({ where: { status: { in: ["OPEN", "INVESTIGATING", "MONITORING"] } } }),
    prisma.systemIncident.count({ where: { status: { in: ["OPEN", "INVESTIGATING", "MONITORING"] }, severity: "CRITICAL" } }),
    prisma.systemHealthEvent.findMany({
      where: { merchantId: { not: null }, errorGroup: { status: "OPEN" } },
      distinct: ["merchantId"],
      select: { merchantId: true },
    }),
    // Real, existing data — ApiRequestLog is the per-request log for the
    // authenticated /api/v1 partner API (see src/lib/api/withApiAuth.ts).
    // No request-duration field exists on it, so this is explicitly scoped
    // to error rate, not response time.
    prisma.apiRequestLog.aggregate({
      where: { createdAt: { gte: since24h } },
      _count: { _all: true },
    }),
  ]);

  const failedApiRequests = await prisma.apiRequestLog.count({ where: { createdAt: { gte: since24h }, statusCode: { gte: 500 } } });
  const totalApiRequests = apiRequestStats._count._all;

  const webhooksService = services.find((s) => s.service === "Webhooks");
  const failedWebhooks = webhooksService && webhooksService.status !== "UNKNOWN" ? webhooksService.recentFailureCount : null;

  return {
    overallStatus: computeOverallStatus(services, criticalIncidentCount > 0),
    activeErrors,
    activeIncidents,
    affectedMerchants: affectedMerchantRows.length,
    // No standardized job-run history exists yet (see serviceStatus.ts's
    // backgroundJobsStatus) — genuinely Unknown, not zero.
    failedJobs: null,
    failedWebhooks,
    apiErrorRatePercent: totalApiRequests > 0 ? Math.round((failedApiRequests / totalApiRequests) * 1000) / 10 : null,
    averageApiResponseTimeMs: null,
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
  };
}
