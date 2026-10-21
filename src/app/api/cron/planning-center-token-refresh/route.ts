import { NextResponse } from "next/server";
import { alertCronMisconfiguration } from "@/lib/cron/alertCronMisconfiguration";
import { isPlanningCenterIntegrationEnabled } from "@/lib/integrations/planningcenter/config";
import { refreshExpiringConnections } from "@/lib/integrations/planningcenter/service";
import { withJobRunTracking } from "@/lib/monitoring/jobRunTracking";

/**
 * Keeps Planning Center grants alive. Planning Center honors a refresh token
 * for ~90 days after issue, so a church that never triggers an API call
 * would otherwise be silently disconnected. Refreshes every CONNECTED
 * connection whose refresh token expires within REFRESH_AHEAD_DAYS.
 *
 * Not yet added to vercel.json's crons array — an infrastructure change
 * deferred until a pilot church is connected (same as aplos-sync). Suggested
 * schedule when enabled: daily.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (process.env.NODE_ENV === "production") {
    if (!process.env.CRON_SECRET) {
      console.error("CRON_SECRET is not configured in production");
      alertCronMisconfiguration("planning-center-token-refresh");
      return NextResponse.json({ error: "Configuration Error" }, { status: 500 });
    }
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isPlanningCenterIntegrationEnabled()) {
    return NextResponse.json({ skipped: true, reason: "PLANNING_CENTER_INTEGRATION_ENABLED is not set to true" });
  }

  const result = await withJobRunTracking({ jobName: "planning-center-token-refresh", jobType: "planning_center" }, async () => {
    const summary = await refreshExpiringConnections();
    return {
      processedCount: summary.checked,
      successCount: summary.refreshed,
      failedCount: summary.failed,
      metadata: summary,
    };
  });

  return NextResponse.json({ checked: result.processedCount, refreshed: result.successCount, failed: result.failedCount });
}
