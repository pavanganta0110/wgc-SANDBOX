import { NextResponse } from "next/server";
import { alertCronMisconfiguration } from "@/lib/cron/alertCronMisconfiguration";
import { runFollowups } from "@/lib/scorecard/service";

export const maxDuration = 60;

/**
 * Runs once a day (see vercel.json): rechecks payments still being confirmed, then sends the follow-up emails that are
 * due (day 1, 4, 10 for people who did not buy; day 2, 6, 14 for buyers). Daily, not hourly, because this project's Vercel
 * plan only allows once-a-day schedules; the follow-ups are measured in days so that is enough. Same CRON_SECRET bearer
 * auth as every other cron in this app.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (process.env.NODE_ENV === "production") {
    if (!process.env.CRON_SECRET) {
      console.error("CRON_SECRET is not configured in production");
      alertCronMisconfiguration("scorecard-followups");
      return NextResponse.json({ error: "Configuration Error" }, { status: 500 });
    }
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  } else if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sent = await runFollowups();
  return NextResponse.json({ ok: true, sent });
}
