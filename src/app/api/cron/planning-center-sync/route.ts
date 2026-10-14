import { NextResponse } from "next/server";
import { alertCronMisconfiguration } from "@/lib/cron/alertCronMisconfiguration";
import { isPlanningCenterSyncEnabled } from "@/lib/integrations/planningcenter/config";
import { runSyncForAllChurches } from "@/lib/integrations/planningcenter/syncRunner";
import { withJobRunTracking } from "@/lib/monitoring/jobRunTracking";

export const maxDuration = 60;

/**
 * Pushes settled deposits to Planning Center for every church that has gift
 * sync on. Bounded to one time budget per tick; a large deposit simply
 * continues on the next tick. Does nothing at all unless the platform switch
 * PLANNING_CENTER_SYNC_ENABLED is true.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (process.env.NODE_ENV === "production") {
    if (!process.env.CRON_SECRET) {
      console.error("CRON_SECRET is not configured in production");
      alertCronMisconfiguration("planning-center-sync");
      return NextResponse.json({ error: "Configuration Error" }, { status: 500 });
    }
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  } else if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isPlanningCenterSyncEnabled()) {
    return NextResponse.json({ skipped: true, reason: "PLANNING_CENTER_SYNC_ENABLED is not set to true" });
  }

  const result = await withJobRunTracking({ jobName: "planning-center-sync", jobType: "planning_center" }, async () => {
    const summary = await runSyncForAllChurches();
    const failed = summary.outcomes.FAILED ?? 0;
    return {
      processedCount: summary.settlementsProcessed,
      successCount: summary.settlementsProcessed - failed,
      failedCount: failed,
      metadata: { ...summary },
    };
  });

  return NextResponse.json({ processed: result.processedCount, failed: result.failedCount, ...(result.metadata ?? {}) });
}
