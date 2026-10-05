import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { attemptWebhookDelivery } from "@/lib/webhooks/deliverWebhook";
import { alertCronMisconfiguration } from "@/lib/cron/alertCronMisconfiguration";
import { withJobRunTracking } from "@/lib/monitoring/jobRunTracking";

/**
 * Runs once daily (see vercel.json) — retries any webhook delivery whose
 * nextRetryAt has passed. Daily, not every 15 minutes as originally
 * designed: this project's Vercel plan only allows once-per-day cron
 * schedules (a more frequent expression fails at deploy time), so a
 * failed delivery's automated retry can now be delayed up to ~24h behind
 * its computed backoff time. This does NOT affect the primary delivery
 * path — emitEvent() still attempts every delivery immediately and inline
 * regardless of this cron's cadence; this cron is purely the backstop for
 * deliveries that failed and are waiting on backoff, or for a delivery
 * whose inline attempt never got the chance to run (e.g. the process was
 * recycled). Upgrading the Vercel plan would let this run far more often.
 * Same CRON_SECRET bearer-auth pattern as every other cron in this app.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (process.env.NODE_ENV === "production") {
    if (!process.env.CRON_SECRET) {
      console.error("CRON_SECRET is not configured in production");
      alertCronMisconfiguration("webhook-retry");
      return NextResponse.json({ error: "Configuration Error" }, { status: 500 });
    }
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await withJobRunTracking({ jobName: "webhook-retry", jobType: "webhook" }, async () => {
    const due = await prisma.webhookDelivery.findMany({
      where: { status: "FAILED", nextRetryAt: { lte: new Date() } },
      select: { id: true },
      take: 200,
    });

    let succeeded = 0;
    let stillFailing = 0;
    for (const row of due) {
      const before = await prisma.webhookDelivery.findUnique({ where: { id: row.id }, select: { status: true } });
      await attemptWebhookDelivery(row.id);
      const after = await prisma.webhookDelivery.findUnique({ where: { id: row.id }, select: { status: true } });
      if (before?.status !== "SUCCEEDED" && after?.status === "SUCCEEDED") succeeded++;
      else if (after?.status !== "SUCCEEDED") stillFailing++;
    }

    return { processedCount: due.length, successCount: succeeded, failedCount: stillFailing };
  });

  return NextResponse.json({ success: true, attempted: result.processedCount, succeeded: result.successCount, stillFailing: result.failedCount });
}
