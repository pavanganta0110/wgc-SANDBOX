import { NextResponse } from "next/server";
import { alertCronMisconfiguration } from "@/lib/cron/alertCronMisconfiguration";
import { withJobRunTracking } from "@/lib/monitoring/jobRunTracking";
import { runDueSeries } from "@/lib/giving/campaignSeries";

/**
 * Daily cron (see vercel.json) — sends this month's run of every repeating
 * Giving Campaign that is due, and finishes any earlier run that didn't fit
 * in one invocation. Same CRON_SECRET bearer-auth pattern as the other crons.
 */
export const maxDuration = 60;

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (process.env.NODE_ENV === "production") {
    if (!process.env.CRON_SECRET) {
      console.error("CRON_SECRET is not configured in production");
      alertCronMisconfiguration("scheduled-campaigns");
      return NextResponse.json({ error: "Configuration Error" }, { status: 500 });
    }
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await withJobRunTracking({ jobName: "scheduled-campaigns", jobType: "email" }, async () => {
    const r = await runDueSeries();
    return { processedCount: r.campaignsCreated + r.resumed, successCount: r.emailsSent, failedCount: r.emailsFailed, metadata: { seriesDue: r.seriesDue, skippedEmptyAudience: r.skippedEmptyAudience } };
  });
  return NextResponse.json({ success: true, ...result });
}
