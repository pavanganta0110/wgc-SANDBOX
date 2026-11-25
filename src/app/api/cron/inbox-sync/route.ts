import { NextResponse } from "next/server";
import { alertCronMisconfiguration } from "@/lib/cron/alertCronMisconfiguration";
import { withJobRunTracking } from "@/lib/monitoring/jobRunTracking";
import { prisma } from "@/lib/prisma";
import { syncMailbox } from "@/lib/inbox/sync";

/** Pulls new support-mailbox email into the admin Inbox. Same CRON_SECRET bearer auth as every cron. */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (process.env.NODE_ENV === "production") {
    if (!process.env.CRON_SECRET) {
      console.error("CRON_SECRET is not configured in production");
      alertCronMisconfiguration("inbox-sync");
      return NextResponse.json({ error: "Configuration Error" }, { status: 500 });
    }
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  } else if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withJobRunTracking({ jobName: "inbox-sync", jobType: "inbox" }, async () => {
      const all = await prisma.inboxMailbox.findMany({ select: { id: true, ownerAdminUserId: true } });
      const ownerIds = [...new Set(all.map((m) => m.ownerAdminUserId).filter((v): v is string => Boolean(v)))];
      const disabled = new Set(
        ownerIds.length ? (await prisma.user.findMany({ where: { id: { in: ownerIds }, disabledAt: { not: null } }, select: { id: true } })).map((u) => u.id) : []
      );
      const mailboxes = all.filter((m) => !m.ownerAdminUserId || !disabled.has(m.ownerAdminUserId));
      let imported = 0;
      let ticketed = 0;
      let failed = 0;
      for (const mb of mailboxes) {
        try {
          const r = await syncMailbox(mb.id);
          imported += r.imported;
          ticketed += r.ticketed;
        } catch {
          failed++; // syncMailbox already stored lastError on the mailbox
        }
      }
      return { processedCount: mailboxes.length, successCount: mailboxes.length - failed, failedCount: failed, metadata: { imported, ticketed } };
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("inbox-sync cron failed:", err);
    return NextResponse.json({ error: "inbox-sync failed" }, { status: 500 });
  }
}
