import { NextResponse } from "next/server";
import { reconcileWgcSubscriptions } from "@/lib/billing/subscriptionReconciliation";

/** Same CRON_SECRET auth pattern as /api/cron/reconcile. */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (process.env.NODE_ENV === "production") {
    if (!process.env.CRON_SECRET) {
      console.error("CRON_SECRET is not configured in production");
      return NextResponse.json({ error: "Configuration Error" }, { status: 500 });
    }
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await reconcileWgcSubscriptions();
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("Subscription reconciliation cron failed:", err);
    return NextResponse.json({ success: false, error: "Reconciliation failed" }, { status: 500 });
  }
}
