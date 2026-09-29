import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { alertCronMisconfiguration } from "@/lib/cron/alertCronMisconfiguration";
import { finixClient } from "@/lib/finix/client";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { withJobRunTracking } from "@/lib/monitoring/jobRunTracking";

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Today's weekday (0=Sunday..6=Saturday) in America/Chicago, matching
 * every other business-day computation in this codebase (see
 * formatDateTimeCDT.ts) — a cadence configured as "release on Monday"
 * should mean Monday in the business's own timezone, not whatever UTC
 * happens to be when Vercel's cron fires. */
function todayWeekdayCentral(): number {
  const short = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short" }).format(new Date());
  return WEEKDAY_NAMES.indexOf(short);
}

/**
 * Daily job: for every merchant configured with an auto-release cadence
 * (Church.settlementAutoReleaseWeekdays) that includes today's weekday,
 * releases every currently-ready (ready_to_settle_at already passed)
 * Settlement Queue Entry. Skips merchants whose settlement_queue_mode
 * isn't MANUAL (nothing queued to release) and entries not yet ready
 * (Finix would reject them anyway — filtering here avoids a guaranteed-
 * failing API call per entry).
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (process.env.NODE_ENV === "production") {
    if (!process.env.CRON_SECRET) {
      console.error("CRON_SECRET is not configured in production");
      alertCronMisconfiguration("release-settlement-queue");
      return NextResponse.json({ error: "Configuration Error" }, { status: 500 });
    }
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await withJobRunTracking({ jobName: "release-settlement-queue", jobType: "settlement" }, async () => {
    const weekday = todayWeekdayCentral();

    const churches = await prisma.church.findMany({
      where: {
        settlementAutoReleaseWeekdays: { has: weekday },
        finixMerchantId: { not: null },
      },
      select: { id: true, name: true, finixMerchantId: true },
    });

    let merchantsProcessed = 0;
    let entriesReleased = 0;
    let failed = 0;

    for (const church of churches) {
      try {
        const merchant = await finixClient.getMerchant(church.finixMerchantId as string);
        if (merchant.settlement_queue_mode !== "MANUAL") continue;

        const listed = await finixClient.listSettlementQueueEntries({ merchantId: church.finixMerchantId as string });
        const entries = (listed._embedded?.settlement_queue_entries ?? []) as Array<{ id: string; ready_to_settle_at?: string }>;
        const now = Date.now();
        const readyIds = entries
          .filter((e) => !e.ready_to_settle_at || new Date(e.ready_to_settle_at).getTime() <= now)
          .map((e) => e.id);

        if (readyIds.length === 0) continue;

        await finixClient.releaseSettlementQueueEntries(readyIds);
        merchantsProcessed++;
        entriesReleased += readyIds.length;

        await logDashboardAction({
          churchId: church.id,
          actorUserId: null,
          actorEmail: "system@wgcpayments.com",
          actorRole: "system",
          action: "settlement_queue.auto_released",
          entityType: "merchant",
          entityId: church.finixMerchantId as string,
          metadata: { ids: readyIds, weekday },
          req,
        });
      } catch (err) {
        failed++;
        console.error("release-settlement-queue: failed for church", church.id, err);
      }
    }

    return { processedCount: churches.length, successCount: merchantsProcessed, failedCount: failed, metadata: { weekday, entriesReleased } };
  });

  return NextResponse.json({ success: true, ...result });
}
