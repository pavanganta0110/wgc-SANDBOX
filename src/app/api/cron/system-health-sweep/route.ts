import { NextResponse } from "next/server";
import { alertCronMisconfiguration } from "@/lib/cron/alertCronMisconfiguration";
import { withJobRunTracking } from "@/lib/monitoring/jobRunTracking";
import { evaluateAllServiceIncidents } from "@/lib/monitoring/incidentEngine";
import { sendDueReminders } from "@/lib/monitoring/alertEngine";
import { cleanupOldMonitoringData } from "@/lib/monitoring/retention";

/**
 * Daily backstop for everything System Health can't detect purely
 * event-driven: a service recovering (there's no "20 minutes of nothing
 * going wrong" event to react to), a webhook backlog or stale background
 * job building up silently, escalation reminders for a still-open
 * incident, and routine data retention.
 *
 * Real-time detection for actual production failures (Finix/Resend/
 * Twilio/Aplos/Webhooks/WGC API technical errors) does NOT depend on this
 * cron at all — that happens immediately, inline, every time
 * recordHealthEvent() is called from live traffic (see
 * incidentEngine.ts's evaluateErrorGroupIncident). This route is the
 * once-daily catch-up pass for everything else.
 *
 * Same CRON_SECRET bearer-auth pattern as every other cron in this app.
 * Daily, not more frequent, for the same documented reason as
 * webhook-retry: this project's Vercel plan only allows once-daily cron
 * schedules. An external ping service hitting this endpoint more often
 * (it's safe and idempotent to call anytime) would close that gap without
 * a Vercel plan change — see the Phase 4 completion report.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (process.env.NODE_ENV === "production") {
    if (!process.env.CRON_SECRET) {
      console.error("CRON_SECRET is not configured in production");
      alertCronMisconfiguration("system-health-sweep");
      return NextResponse.json({ error: "Configuration Error" }, { status: 500 });
    }
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withJobRunTracking({ jobName: "system-health-sweep", jobType: "monitoring" }, async () => {
      let incidentSweepFailed = false;
      let reminderSweepFailed = false;
      let cleanup = { jobRunsDeleted: 0, routineHealthEventsDeleted: 0, errorHealthEventsDeleted: 0, alertsDeleted: 0 };

      try {
        await evaluateAllServiceIncidents();
      } catch (err) {
        console.error("system-health-sweep: incident evaluation failed:", err);
        incidentSweepFailed = true;
      }

      try {
        await sendDueReminders();
      } catch (err) {
        console.error("system-health-sweep: reminder sweep failed:", err);
        reminderSweepFailed = true;
      }

      try {
        cleanup = await cleanupOldMonitoringData();
      } catch (err) {
        console.error("system-health-sweep: retention cleanup failed:", err);
      }

      const failedCount = (incidentSweepFailed ? 1 : 0) + (reminderSweepFailed ? 1 : 0);
      return {
        processedCount: 2,
        successCount: 2 - failedCount,
        failedCount,
        metadata: { cleanup },
      };
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("system-health-sweep cron failed:", err);
    return NextResponse.json({ success: false, error: "Sweep failed" }, { status: 500 });
  }
}
