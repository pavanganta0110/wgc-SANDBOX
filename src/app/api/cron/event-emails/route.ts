import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { alertCronMisconfiguration } from "@/lib/cron/alertCronMisconfiguration";
import { withJobRunTracking } from "@/lib/monitoring/jobRunTracking";
import { claimAndSendBroadcast, findDueBroadcasts } from "@/lib/eventRegistration/eventBroadcast";

/**
 * Daily cron (see vercel.json) — sends each ACTIVE event's reminder and
 * thank-you email when its merchant-configured day arrives. Sends are
 * claimed in the database before any email goes out, so overlapping runs
 * (or a manual "Send now") never double-email attendees. Same CRON_SECRET
 * bearer-auth pattern as /api/cron/invoice-reminders.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (process.env.NODE_ENV === "production") {
    if (!process.env.CRON_SECRET) {
      console.error("CRON_SECRET is not configured in production");
      alertCronMisconfiguration("event-emails");
      return NextResponse.json({ error: "Configuration Error" }, { status: 500 });
    }
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await withJobRunTracking({ jobName: "event-emails", jobType: "email" }, async () => {
    const now = new Date();
    const horizon = new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000);
    const events = await prisma.event.findMany({
      where: {
        status: "ACTIVE",
        archivedAt: null,
        // Nothing older than the thank-you window can still be due.
        OR: [{ endsAt: { gte: horizon } }, { endsAt: null, startsAt: { gte: horizon } }],
      },
      select: { id: true, churchId: true, startsAt: true, endsAt: true, emailTemplatesJson: true, reminderSentAt: true, thankYouSentAt: true },
      take: 500,
    });

    const due = findDueBroadcasts(events, now);
    let sent = 0;
    let failed = 0;
    let processed = 0;
    for (const d of due) {
      try {
        const r = await claimAndSendBroadcast(d.churchId, d.id, d.kind);
        if (!r.claimed) continue;
        processed += 1;
        sent += r.sent;
        failed += r.failed;
      } catch (err) {
        failed += 1;
        console.error("[event-emails] broadcast failed", { eventId: d.id, kind: d.kind, err });
      }
    }
    return { processedCount: processed, successCount: sent, failedCount: failed, metadata: { eventsDue: due.length } };
  });
  return NextResponse.json({ success: true, ...result });
}
