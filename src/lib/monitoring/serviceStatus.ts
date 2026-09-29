import { prisma } from "@/lib/prisma";

/**
 * Server-only. Computes each System Health service card's status from
 * whatever REAL data already exists — never a placeholder. Two genuinely
 * different reasons a card can show "UNKNOWN" today:
 *
 *  1. No producer has ever run for this service at all (e.g. "Background
 *     Jobs" — no job-run history table exists anywhere in the app yet;
 *     that's explicit Phase 4 work).
 *  2. A producer exists and has real rows, just none in the lookback
 *     window — that's OPERATIONAL, not unknown (silence is good news once
 *     you know the service is actually being watched).
 *
 * Per the "reuse existing systems" instruction, several of these read
 * tables that already existed before this System Health work — they are
 * NOT new Phase-3 producers, they're this phase reusing what's already
 * there instead of waiting for Phase 3 to duplicate it:
 *  - Resend  -> OrgEmailLog (donor/org-facing email delivery log)
 *  - Twilio  -> AuthSmsSendLog (2FA SMS delivery log)
 *  - Aplos   -> AplosSyncRecord (fund-accounting sync record)
 *  - Webhooks -> FinixWebhookEvent (inbound Finix webhook processing log)
 *
 * "Finix" (the payment-operations service, distinct from "Webhooks") and
 * "Supabase" (database health) have no existing safe, unambiguous signal —
 * see the doc comments below for exactly why — so both are genuinely
 * UNKNOWN until Phase 3 builds real monitoring for them.
 */

const LOOKBACK_MS = 24 * 60 * 60 * 1000;

export type ServiceStatusValue = "OPERATIONAL" | "DEGRADED" | "OUTAGE" | "UNKNOWN";

export interface ServiceStatus {
  service: string;
  status: ServiceStatusValue;
  /** Failures observed in the lookback window (only meaningful when status !== "UNKNOWN"). */
  recentFailureCount: number;
  lastFailureAt: Date | null;
  lastSuccessAt: Date | null;
  /** Short, human explanation of what backs this card's status (or why it's Unknown) — shown in the UI so nothing looks unexplained. */
  note: string;
}

function unknown(service: string, note: string): ServiceStatus {
  return { service, status: "UNKNOWN", recentFailureCount: 0, lastFailureAt: null, lastSuccessAt: null, note };
}

async function wgcApiStatus(): Promise<ServiceStatus> {
  const since = new Date(Date.now() - LOOKBACK_MS);
  // No "success" event is ever recorded for WGC API — onRequestError only
  // fires on failure — so lastSuccessAt is genuinely unknowable from this
  // data source, not just unfetched; see the null below.
  const openGroups = await prisma.systemErrorGroup.findMany({
    where: { service: "WGC API", status: "OPEN", lastSeenAt: { gte: since } },
    orderBy: { lastSeenAt: "desc" },
    take: 1,
    select: { lastSeenAt: true, severity: true, occurrenceCount: true },
  });

  const failureCount = openGroups.reduce((sum, g) => sum + g.occurrenceCount, 0);
  const status: ServiceStatusValue = openGroups.some((g) => g.severity === "CRITICAL") ? "OUTAGE" : openGroups.length > 0 ? "DEGRADED" : "OPERATIONAL";

  return {
    service: "WGC API",
    status,
    recentFailureCount: failureCount,
    lastFailureAt: openGroups[0]?.lastSeenAt ?? null,
    lastSuccessAt: null,
    note:
      status === "OPERATIONAL"
        ? "No uncaught server errors in the last 24h."
        : `${failureCount} uncaught server error${failureCount === 1 ? "" : "s"} in the last 24h.`,
  };
}

async function supabaseStatus(): Promise<ServiceStatus> {
  // No query-timeout, connection-failure, or slow-query tracking exists
  // anywhere in the app (Prisma's own client only logs "error"-level
  // output to stdout — see src/lib/prisma.ts). There is nothing real to
  // report yet; Phase 3's "Supabase / database health" work is what adds
  // this.
  return unknown("Supabase", "No database health monitoring is wired up yet (Phase 3).");
}

async function finixStatus(): Promise<ServiceStatus> {
  // Deliberately NOT computed from PaymentAttempt.status = "FAILED" — that
  // field is set for both a genuine technical failure AND a normal donor
  // card decline, and this codebase doesn't yet record which case is
  // which anywhere queryable. Treating a pile of ordinary declines as a
  // Finix outage would be exactly the false-alarm behavior this whole
  // project is trying to avoid. Phase 3's Finix monitoring is what adds a
  // real technical-failure-only signal (see src/lib/finix/client.ts's
  // thrown-Error path vs. cardDeclineReasons.ts's business-decline path).
  return unknown("Finix", "Finix payment-operation monitoring isn't wired up yet (Phase 3) — a normal card decline is not tracked as a failure here.");
}

async function resendStatus(): Promise<ServiceStatus> {
  const since = new Date(Date.now() - LOOKBACK_MS);
  const [everSent, recent] = await Promise.all([
    prisma.orgEmailLog.findFirst({ select: { id: true } }),
    prisma.orgEmailLog.findMany({
      where: { createdAt: { gte: since } },
      select: { status: true, createdAt: true },
    }),
  ]);

  if (!everSent) return unknown("Resend", "No emails have been sent through this yet.");

  const failed = recent.filter((r) => r.status === "FAILED");
  const lastSuccess = recent.filter((r) => r.status === "SENT").sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  const lastFailure = failed.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

  return {
    service: "Resend",
    status: failed.length === 0 ? "OPERATIONAL" : failed.length > recent.length / 2 ? "OUTAGE" : "DEGRADED",
    recentFailureCount: failed.length,
    lastFailureAt: lastFailure?.createdAt ?? null,
    lastSuccessAt: lastSuccess?.createdAt ?? null,
    note: `${failed.length} failed of ${recent.length} emails in the last 24h.`,
  };
}

async function twilioStatus(): Promise<ServiceStatus> {
  const since = new Date(Date.now() - LOOKBACK_MS);
  const [everSent, recent] = await Promise.all([
    prisma.authSmsSendLog.findFirst({ select: { id: true } }),
    prisma.authSmsSendLog.findMany({
      where: { createdAt: { gte: since } },
      select: { deliveryStatus: true, createdAt: true },
    }),
  ]);

  if (!everSent) return unknown("Twilio", "No SMS has been sent through this yet.");

  const failed = recent.filter((r) => r.deliveryStatus === "FAILED" || r.deliveryStatus === "UNDELIVERED");
  const lastSuccess = recent.filter((r) => r.deliveryStatus === "DELIVERED" || r.deliveryStatus === "SENT").sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  const lastFailure = failed.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

  return {
    service: "Twilio",
    status: failed.length === 0 ? "OPERATIONAL" : failed.length > recent.length / 2 ? "OUTAGE" : "DEGRADED",
    recentFailureCount: failed.length,
    lastFailureAt: lastFailure?.createdAt ?? null,
    lastSuccessAt: lastSuccess?.createdAt ?? null,
    note: `${failed.length} failed/undelivered of ${recent.length} SMS in the last 24h.`,
  };
}

async function aplosStatus(): Promise<ServiceStatus> {
  const since = new Date(Date.now() - LOOKBACK_MS);
  const [everSynced, recent] = await Promise.all([
    prisma.aplosSyncRecord.findFirst({ select: { id: true } }),
    prisma.aplosSyncRecord.findMany({
      where: { updatedAt: { gte: since } },
      select: { status: true, updatedAt: true },
    }),
  ]);

  if (!everSynced) return unknown("Aplos", "No church has an active Aplos connection yet.");

  const failed = recent.filter((r) => r.status === "FAILED" || r.status === "NEEDS_REVIEW");
  const lastSuccess = recent.filter((r) => r.status === "SYNCED").sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
  const lastFailure = failed.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];

  return {
    service: "Aplos",
    status: failed.length === 0 ? "OPERATIONAL" : failed.length > recent.length / 2 ? "OUTAGE" : "DEGRADED",
    recentFailureCount: failed.length,
    lastFailureAt: lastFailure?.updatedAt ?? null,
    lastSuccessAt: lastSuccess?.updatedAt ?? null,
    note: `${failed.length} failed/needs-review of ${recent.length} sync records touched in the last 24h.`,
  };
}

async function webhooksStatus(): Promise<ServiceStatus> {
  const since = new Date(Date.now() - LOOKBACK_MS);
  const [everReceived, recent] = await Promise.all([
    prisma.finixWebhookEvent.findFirst({ select: { id: true } }),
    prisma.finixWebhookEvent.findMany({
      where: { createdAt: { gte: since } },
      select: { processingStatus: true, createdAt: true },
    }),
  ]);

  if (!everReceived) return unknown("Webhooks", "No webhook events have been received yet.");

  const failed = recent.filter((r) => r.processingStatus === "ERROR" || r.processingStatus === "FAILED");
  const lastSuccess = recent.filter((r) => r.processingStatus === "COMPLETED").sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  const lastFailure = failed.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

  return {
    service: "Webhooks",
    status: failed.length === 0 ? "OPERATIONAL" : failed.length > recent.length / 2 ? "OUTAGE" : "DEGRADED",
    recentFailureCount: failed.length,
    lastFailureAt: lastFailure?.createdAt ?? null,
    lastSuccessAt: lastSuccess?.createdAt ?? null,
    note: `${failed.length} failed of ${recent.length} webhook events in the last 24h.`,
  };
}

async function backgroundJobsStatus(): Promise<ServiceStatus> {
  // Confirmed in inspection: none of the 10 Vercel cron routes write to a
  // generic run-history table — they return a JSON summary and rely on
  // Vercel's own function logs. Nothing here to compute honestly yet;
  // Phase 4 is what adds a standardized JobRun-style record.
  return unknown("Background Jobs", "No standardized job-run history exists yet (Phase 4).");
}

export async function getAllServiceStatuses(): Promise<ServiceStatus[]> {
  return Promise.all([wgcApiStatus(), supabaseStatus(), finixStatus(), resendStatus(), twilioStatus(), aplosStatus(), webhooksStatus(), backgroundJobsStatus()]);
}
