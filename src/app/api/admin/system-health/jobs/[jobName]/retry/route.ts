import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth/session";
import { isRetrySafe } from "@/lib/monitoring/jobCadence";
import { GET as runAplosSync } from "@/app/api/cron/aplos-sync/route";
import { GET as runWebhookRetry } from "@/app/api/cron/webhook-retry/route";
import { GET as runReconcile } from "@/app/api/cron/reconcile/route";
import { GET as runReconcileSubscriptions } from "@/app/api/cron/reconcile-subscriptions/route";
import { GET as runInvoiceReminders } from "@/app/api/cron/invoice-reminders/route";
import { GET as runPromoShortfallCheck } from "@/app/api/cron/promo-shortfall-check/route";
import { GET as runSmsAddonOverageCheck } from "@/app/api/cron/sms-addon-overage-check/route";
import { GET as runResyncTransferFees } from "@/app/api/cron/resync-transfer-fees/route";
import { GET as runResyncMonthlyTransferFees } from "@/app/api/cron/resync-monthly-transfer-fees/route";
import { GET as runSystemHealthSweep } from "@/app/api/cron/system-health-sweep/route";

/**
 * Global-admin-only. Manually re-triggers ONE background job on demand by
 * calling that job's own cron route handler in-process — same code path a
 * scheduled run takes (including its own withJobRunTracking instrumentation,
 * so the retry shows up in the job's run history like any other run), never
 * a duplicated copy of the job's logic.
 *
 * Gated on isRetrySafe() (jobCadence.ts) — the single source of truth for
 * which jobs are safe to re-run on demand. `release-settlement-queue` is
 * the deliberate example that is NEVER in this handler map: it releases
 * real settlement funds, and per the platform's "never a blind retry button
 * for a payment operation" rule, no monitoring UI gets a one-click trigger
 * for it, no matter how idempotent its own internal filtering is.
 */
const RETRIGGERABLE_JOBS: Record<string, (req: Request) => Promise<Response>> = {
  "aplos-sync": runAplosSync,
  "webhook-retry": runWebhookRetry,
  reconcile: runReconcile,
  "reconcile-subscriptions": runReconcileSubscriptions,
  "invoice-reminders": runInvoiceReminders,
  "promo-shortfall-check": runPromoShortfallCheck,
  "sms-addon-overage-check": runSmsAddonOverageCheck,
  "resync-transfer-fees": runResyncTransferFees,
  "resync-monthly-transfer-fees": runResyncMonthlyTransferFees,
  "system-health-sweep": runSystemHealthSweep,
};

export async function POST(_req: Request, { params }: { params: Promise<{ jobName: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { jobName } = await params;

  if (!isRetrySafe(jobName)) {
    return NextResponse.json(
      { error: "This job cannot be manually retried — it either doesn't exist or isn't on the safe-retry allowlist (e.g. it moves real money)." },
      { status: 400 }
    );
  }
  const handler = RETRIGGERABLE_JOBS[jobName];
  if (!handler) {
    // Defensive: a job could theoretically be marked retrySafe in
    // jobCadence.ts without (yet) having an entry here — fail loudly rather
    // than silently no-op, so the gap gets noticed and fixed immediately.
    console.error(`[jobs/retry] "${jobName}" is marked retrySafe but has no handler registered`);
    return NextResponse.json({ error: "Retry is not wired up for this job yet." }, { status: 500 });
  }

  // Reuses the exact same bearer-secret auth the scheduled cron uses —
  // constructed server-side from the real env var, never exposed to or
  // supplied by the admin UI.
  const headers = new Headers();
  if (process.env.CRON_SECRET) headers.set("authorization", `Bearer ${process.env.CRON_SECRET}`);
  const syntheticRequest = new Request(`https://internal.wgcpayments.com/api/cron/${jobName}`, { headers });

  try {
    const res = await handler(syntheticRequest);
    const body = await res.json().catch(() => null);
    return NextResponse.json({ triggered: true, jobName, result: body }, { status: res.status });
  } catch (err) {
    console.error(`[jobs/retry] manual retry of ${jobName} failed:`, err);
    return NextResponse.json({ error: "Retry failed", detail: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
