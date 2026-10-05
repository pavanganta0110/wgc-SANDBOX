import { NextResponse } from "next/server";
import { sendDueInvoiceReminders } from "@/lib/invoices/invoiceReminders";
import { alertCronMisconfiguration } from "@/lib/cron/alertCronMisconfiguration";
import { withJobRunTracking } from "@/lib/monitoring/jobRunTracking";

/**
 * Daily cron (see vercel.json) — sends every invoice reminder whose
 * scheduledFor time has passed. Same CRON_SECRET bearer-auth pattern as
 * /api/cron/reconcile.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (process.env.NODE_ENV === "production") {
    if (!process.env.CRON_SECRET) {
      console.error("CRON_SECRET is not configured in production");
      alertCronMisconfiguration("invoice-reminders");
      return NextResponse.json({ error: "Configuration Error" }, { status: 500 });
    }
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await withJobRunTracking({ jobName: "invoice-reminders", jobType: "email" }, async () => {
    const r = await sendDueInvoiceReminders();
    return { processedCount: r.processed, successCount: r.sent, failedCount: r.failed, metadata: { skipped: r.skipped } };
  });
  return NextResponse.json({ success: true, ...result });
}
