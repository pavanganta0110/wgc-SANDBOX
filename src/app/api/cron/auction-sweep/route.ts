import { NextResponse } from "next/server";
import { runAuctionSweep } from "@/lib/auctions/settleAuction";
import { alertCronMisconfiguration } from "@/lib/cron/alertCronMisconfiguration";
import { withJobRunTracking } from "@/lib/monitoring/jobRunTracking";

/**
 * Daily cron (see vercel.json): settles any auction whose time is up, delivers undelivered winner emails, records
 * paid invoices, and moves unpaid wins on to the next bidder. Everything it does is also safe to run any other
 * time, and a visit to an auction page settles a due item on its own. Same CRON_SECRET bearer auth as the others.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (process.env.NODE_ENV === "production") {
    if (!process.env.CRON_SECRET) {
      console.error("CRON_SECRET is not configured in production");
      alertCronMisconfiguration("auction-sweep");
      return NextResponse.json({ error: "Configuration Error" }, { status: 500 });
    }
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  } else if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await withJobRunTracking({ jobName: "auction-sweep", jobType: "email" }, async () => {
    const r = await runAuctionSweep();
    return { processedCount: r.auctionsSettled + r.winsPaid + r.offered + r.forfeited, successCount: r.invoicesCreated + r.invoicesResent, failedCount: 0, metadata: { ...r } };
  });
  return NextResponse.json({ success: true, ...result });
}
