import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth/session";
import { isRetrySafe } from "@/lib/monitoring/jobCadence";

/**
 * Global-admin-only. Manually re-triggers ONE background job on demand by
 * making a real HTTP call to that job's own cron endpoint — same code path
 * a scheduled run takes (including its own withJobRunTracking
 * instrumentation, so the retry shows up in the job's run history like any
 * other run), reusing the same base-URL fallback pattern already used
 * elsewhere in this codebase (see reconcile/route.ts's adminDashboardLink).
 *
 * Deliberately an HTTP call rather than importing the cron route's handler
 * function directly: importing ten different route.ts modules' GET
 * exports into this one file would pull each of their full dependency
 * trees (Prisma, the Finix client, email/SMS senders, ...) into this
 * route's own serverless function bundle, risking a function-size problem
 * with no benefit — an HTTP call keeps every cron route independently
 * bundled exactly as Next.js already builds it.
 *
 * Gated on isRetrySafe() (jobCadence.ts) — the single source of truth for
 * which jobs are safe to re-run on demand. `release-settlement-queue` is
 * the deliberate example that is NEVER in this path map: it releases real
 * settlement funds, and per the platform's "never a blind retry button for
 * a payment operation" rule, no monitoring UI gets a one-click trigger for
 * it, no matter how idempotent its own internal filtering is.
 */
const RETRIGGERABLE_JOB_PATHS: Record<string, string> = {
  "aplos-sync": "/api/cron/aplos-sync",
  "webhook-retry": "/api/cron/webhook-retry",
  reconcile: "/api/cron/reconcile",
  "reconcile-subscriptions": "/api/cron/reconcile-subscriptions",
  "invoice-reminders": "/api/cron/invoice-reminders",
  "event-emails": "/api/cron/event-emails",
  "scheduled-campaigns": "/api/cron/scheduled-campaigns",
  "promo-shortfall-check": "/api/cron/promo-shortfall-check",
  "sms-addon-overage-check": "/api/cron/sms-addon-overage-check",
  "resync-transfer-fees": "/api/cron/resync-transfer-fees",
  "resync-monthly-transfer-fees": "/api/cron/resync-monthly-transfer-fees",
  "system-health-sweep": "/api/cron/system-health-sweep",
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
  const path = RETRIGGERABLE_JOB_PATHS[jobName];
  if (!path) {
    // Defensive: a job could theoretically be marked retrySafe in
    // jobCadence.ts without (yet) having a path registered here — fail
    // loudly rather than silently no-op, so the gap gets noticed and fixed.
    console.error(`[jobs/retry] "${jobName}" is marked retrySafe but has no path registered`);
    return NextResponse.json({ error: "Retry is not wired up for this job yet." }, { status: 500 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.wgcpayments.com";
  const headers = new Headers();
  // Reuses the exact same bearer-secret auth the scheduled cron uses —
  // constructed server-side from the real env var, never exposed to or
  // supplied by the admin UI.
  if (process.env.CRON_SECRET) headers.set("authorization", `Bearer ${process.env.CRON_SECRET}`);

  try {
    const res = await fetch(`${baseUrl}${path}`, { headers, cache: "no-store" });
    const body = await res.json().catch(() => null);
    return NextResponse.json({ triggered: true, jobName, result: body }, { status: res.status });
  } catch (err) {
    console.error(`[jobs/retry] manual retry of ${jobName} failed:`, err);
    return NextResponse.json({ error: "Retry failed", detail: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
