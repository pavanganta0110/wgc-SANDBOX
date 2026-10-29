import { NextResponse } from "next/server";
import { alertCronMisconfiguration } from "@/lib/cron/alertCronMisconfiguration";
import { withJobRunTracking } from "@/lib/monitoring/jobRunTracking";
import { runPartnerBilling } from "@/lib/partners/partnerInvoicing";

/**
 * Daily. Makes the month's invoice for every billed partner (once: the unique key makes a
 * second run a no-op), then charges what is due, including tomorrow's retry of a failed
 * charge. Cards are only touched when PARTNER_BILLING_CHARGING_ENABLED=1; without it this
 * only makes invoices. Same CRON_SECRET auth as the other crons.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (process.env.NODE_ENV === "production") {
    if (!process.env.CRON_SECRET) {
      console.error("CRON_SECRET is not configured in production");
      alertCronMisconfiguration("partner-billing");
      return NextResponse.json({ error: "Configuration Error" }, { status: 500 });
    }
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const run = await withJobRunTracking({ jobName: "partner-billing", jobType: "billing" }, async () => {
      const r = await runPartnerBilling();
      return {
        processedCount: r.invoicesMade + r.charged + r.failed + r.awaitingCard + r.pending,
        successCount: r.invoicesMade + r.charged,
        failedCount: r.failed,
        metadata: r as unknown as Record<string, unknown>,
      };
    });
    return NextResponse.json({ success: true, ...run });
  } catch (err) {
    console.error("partner-billing cron failed:", err);
    return NextResponse.json({ error: "Partner billing run failed." }, { status: 500 });
  }
}
