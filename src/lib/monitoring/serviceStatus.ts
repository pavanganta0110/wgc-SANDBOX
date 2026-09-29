import { prisma } from "@/lib/prisma";
import {
  FINIX_STATUS_WINDOW_MS,
  FINIX_DEGRADED_FAILURE_RATE,
  FINIX_CRITICAL_FAILURE_RATE,
  DATABASE_STATUS_WINDOW_MS,
  DB_DEGRADED_FAILURE_COUNT,
  DB_CRITICAL_FAILURE_COUNT,
  RESEND_STATUS_WINDOW_MS,
  EMAIL_FAILURE_RATE_WARNING,
  EMAIL_FAILURE_RATE_CRITICAL,
  TWILIO_STATUS_WINDOW_MS,
  TWILIO_FAILURE_RATE_WARNING,
  TWILIO_FAILURE_RATE_CRITICAL,
  APLOS_STATUS_WINDOW_MS,
  APLOS_FAILURE_RATE_WARNING,
  APLOS_FAILURE_RATE_CRITICAL,
  WEBHOOK_STATUS_WINDOW_MS,
  WEBHOOK_FAILURE_RATE_WARNING,
  WEBHOOK_FAILURE_RATE_CRITICAL,
  WEBHOOK_BACKLOG_WARNING,
  WEBHOOK_BACKLOG_CRITICAL,
  WEBHOOK_PENDING_AGE_THRESHOLD_MS,
} from "./thresholds";
import { isRecipientSpecificTwilioError } from "./twilioHealth";

/**
 * Server-only. Computes each System Health service card's status from
 * whatever REAL data already exists — never a placeholder. Two genuinely
 * different reasons a card can show "UNKNOWN":
 *
 *  1. No producer has ever run for this service at all (e.g. "Background
 *     Jobs" — no job-run history table exists anywhere in the app yet;
 *     that's explicit Phase 4 work).
 *  2. A producer exists and has real rows, just none in the lookback
 *     window — that's OPERATIONAL, not unknown (silence is good news once
 *     you know the service is actually being watched).
 *
 * Every status function uses its OWN recent window (see thresholds.ts) —
 * a Finix failure from three weeks ago must not make Finix look Degraded
 * today.
 *
 * Per the "reuse existing systems" instruction, several of these read
 * tables that already existed before this System Health work rather than
 * duplicating them:
 *  - Resend   -> OrgEmailLog (donor/org-facing email delivery log)
 *  - Twilio   -> AuthSmsSendLog (2FA SMS delivery log)
 *  - Aplos    -> AplosSyncRecord (fund-accounting sync record)
 *  - Webhooks -> FinixWebhookEvent (inbound Finix webhook processing log)
 *  - Finix    -> PaymentAttempt (as an approximate real-traffic denominator
 *    for a failure RATE — see finixStatus()'s own comment) plus the new
 *    SystemHealthEvent/SystemErrorGroup rows src/lib/finix/client.ts's
 *    fetchApi() now records for genuine technical failures (Phase 3).
 *  - Supabase -> the new SystemHealthEvent rows src/lib/prisma.ts's Prisma
 *    error-event listener now records (Phase 3).
 */

export type ServiceStatusValue = "OPERATIONAL" | "DEGRADED" | "OUTAGE" | "UNKNOWN";

export interface ServiceStatus {
  service: string;
  status: ServiceStatusValue;
  /** Failures observed in the lookback window (only meaningful when status !== "UNKNOWN"). */
  recentFailureCount: number;
  lastFailureAt: Date | null;
  lastSuccessAt: Date | null;
  /**
   * True when this service has a real failure history (lastFailureAt is
   * set) but the current window is clean — "previously unhealthy, now
   * healthy." Phase 5's incident/recovery engine is what turns this into an
   * actual recovery notification; this field just makes the information
   * available without needing a schema change when that's built.
   */
  recentlyRecovered: boolean;
  /** Short, human explanation of what backs this card's status (or why it's Unknown) — shown in the UI so nothing looks unexplained. */
  note: string;
}

function unknown(service: string, note: string): ServiceStatus {
  return { service, status: "UNKNOWN", recentFailureCount: 0, lastFailureAt: null, lastSuccessAt: null, recentlyRecovered: false, note };
}

/** Shared rate->status classification used by every rate-based service below. */
function classifyByRate(failureCount: number, totalCount: number, warningRate: number, criticalRate: number): ServiceStatusValue {
  if (totalCount === 0) return "OPERATIONAL";
  const rate = failureCount / totalCount;
  if (rate >= criticalRate) return "OUTAGE";
  if (rate >= warningRate) return "DEGRADED";
  return "OPERATIONAL";
}

async function wgcApiStatus(): Promise<ServiceStatus> {
  const since = new Date(Date.now() - FINIX_STATUS_WINDOW_MS);
  // No "success" event is ever recorded for WGC API — onRequestError only
  // fires on failure — so lastSuccessAt is genuinely unknowable from this
  // data source, not just unfetched; see the null below.
  const [openGroups, lastEver] = await Promise.all([
    prisma.systemErrorGroup.findMany({
      where: { service: "WGC API", status: "OPEN", lastSeenAt: { gte: since } },
      orderBy: { lastSeenAt: "desc" },
      select: { lastSeenAt: true, severity: true, occurrenceCount: true },
    }),
    prisma.systemErrorGroup.findFirst({ where: { service: "WGC API" }, orderBy: { lastSeenAt: "desc" }, select: { lastSeenAt: true } }),
  ]);

  const failureCount = openGroups.reduce((sum, g) => sum + g.occurrenceCount, 0);
  const status: ServiceStatusValue = openGroups.some((g) => g.severity === "CRITICAL") ? "OUTAGE" : openGroups.length > 0 ? "DEGRADED" : "OPERATIONAL";

  return {
    service: "WGC API",
    status,
    recentFailureCount: failureCount,
    lastFailureAt: openGroups[0]?.lastSeenAt ?? null,
    lastSuccessAt: null,
    recentlyRecovered: status === "OPERATIONAL" && !!lastEver && lastEver.lastSeenAt < since,
    note: status === "OPERATIONAL" ? "No uncaught server errors in the last 15 minutes." : `${failureCount} uncaught server error${failureCount === 1 ? "" : "s"} in the last 15 minutes.`,
  };
}

/**
 * Database connectivity/error signal — populated by src/lib/prisma.ts's
 * Prisma "error" event listener, which calls recordHealthEvent(service:
 * "Supabase") for a genuine Prisma-level error (connection failure, query
 * timeout, etc.), never for a normal query. Count-based rather than
 * rate-based on purpose: there's no sane "total query count" denominator to
 * divide by without adding per-query overhead, and a handful of isolated
 * connectivity blips is a fundamentally different signal than "X% of
 * queries are failing" — an absolute floor (see thresholds.ts) is the
 * honest way to say "one query hiccup is noise, ten in five minutes is not."
 */
async function supabaseStatus(): Promise<ServiceStatus> {
  const since = new Date(Date.now() - DATABASE_STATUS_WINDOW_MS);
  const [everRecorded, recentFailures, lastEver] = await Promise.all([
    prisma.systemHealthEvent.findFirst({ where: { service: "Supabase" }, select: { id: true } }),
    prisma.systemHealthEvent.count({ where: { service: "Supabase", createdAt: { gte: since } } }),
    prisma.systemHealthEvent.findFirst({ where: { service: "Supabase" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);

  if (!everRecorded) return unknown("Supabase", "No database errors have been observed yet — this reflects real traffic, not a synthetic check.");

  const status: ServiceStatusValue = recentFailures >= DB_CRITICAL_FAILURE_COUNT ? "OUTAGE" : recentFailures >= DB_DEGRADED_FAILURE_COUNT ? "DEGRADED" : "OPERATIONAL";

  return {
    service: "Supabase",
    status,
    recentFailureCount: recentFailures,
    lastFailureAt: recentFailures > 0 ? (lastEver?.createdAt ?? null) : null,
    lastSuccessAt: null,
    recentlyRecovered: status === "OPERATIONAL" && !!lastEver && lastEver.createdAt < since,
    note: status === "OPERATIONAL" ? "No database errors in the last 5 minutes." : `${recentFailures} database error${recentFailures === 1 ? "" : "s"} in the last 5 minutes.`,
  };
}

/**
 * Finix's failure RATE, not raw count — a high-volume merchant doing 500
 * refunds/hour with 3 timeouts is healthier than a quiet one doing 5
 * refunds with 3 timeouts. There is deliberately no "every Finix call"
 * success log (that would violate the "don't create millions of rows"
 * rule), so PaymentAttempt.status = SUCCEEDED (donor checkout attempts,
 * already logged for an unrelated reason) is reused as an approximate
 * real-traffic denominator. This under-counts total Finix volume (it
 * misses refunds/subscriptions/onboarding/settlement calls), so the rate
 * this produces is a conservative approximation, not an exact figure —
 * documented here and in the Phase 3 report rather than presented as more
 * precise than it is. Below a minimum sample size, an absolute-count
 * fallback avoids "1 failure out of 1 attempt = 100%!" false alarms during
 * near-zero traffic.
 */
const FINIX_MIN_SAMPLE_SIZE = 5;

async function finixStatus(): Promise<ServiceStatus> {
  const since = new Date(Date.now() - FINIX_STATUS_WINDOW_MS);
  const [failureEvents, successCount, lastEverFailure] = await Promise.all([
    prisma.systemHealthEvent.findMany({
      where: { service: "Finix", createdAt: { gte: since } },
      select: { createdAt: true, severity: true },
    }),
    prisma.paymentAttempt.count({ where: { status: "SUCCEEDED", createdAt: { gte: since } } }),
    prisma.systemHealthEvent.findFirst({ where: { service: "Finix" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);

  if (failureEvents.length === 0 && !lastEverFailure) {
    // Not "no data" the way Resend/Twilio/Aplos start out — the moment a
    // single Finix call has ever failed technically, this becomes real.
    // Until then there's genuinely nothing to report on, since a clean
    // record is indistinguishable from "not wired up" without a success
    // log we deliberately don't keep.
    return unknown("Finix", "No Finix technical failures have been observed yet.");
  }

  const totalSample = failureEvents.length + successCount;
  const criticalCount = failureEvents.filter((e) => e.severity === "CRITICAL").length;

  let status: ServiceStatusValue;
  if (totalSample < FINIX_MIN_SAMPLE_SIZE) {
    // Not enough volume to trust a rate — fall back to "did anything
    // CRITICAL happen at all" (auth failure or Finix 5xx).
    status = criticalCount > 0 ? "OUTAGE" : failureEvents.length > 0 ? "DEGRADED" : "OPERATIONAL";
  } else {
    status = classifyByRate(failureEvents.length, totalSample, FINIX_DEGRADED_FAILURE_RATE, FINIX_CRITICAL_FAILURE_RATE);
  }

  const lastFailureAt = failureEvents.length > 0 ? failureEvents.reduce((latest, e) => (e.createdAt > latest ? e.createdAt : latest), failureEvents[0].createdAt) : null;

  return {
    service: "Finix",
    status,
    recentFailureCount: failureEvents.length,
    lastFailureAt,
    lastSuccessAt: null,
    recentlyRecovered: status === "OPERATIONAL" && !!lastEverFailure && lastEverFailure.createdAt < since,
    note:
      totalSample < FINIX_MIN_SAMPLE_SIZE
        ? `${failureEvents.length} technical failure${failureEvents.length === 1 ? "" : "s"} in the last 15 minutes (low volume — showing failures, not a rate).`
        : `${failureEvents.length} technical failure${failureEvents.length === 1 ? "" : "s"} of ~${totalSample} Finix operations in the last 15 minutes. Card declines are never counted here.`,
  };
}

async function resendStatus(): Promise<ServiceStatus> {
  const since = new Date(Date.now() - RESEND_STATUS_WINDOW_MS);
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
  const lastFailureInWindow = failed.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  const status = classifyByRate(failed.length, recent.length, EMAIL_FAILURE_RATE_WARNING, EMAIL_FAILURE_RATE_CRITICAL);

  return {
    service: "Resend",
    status,
    recentFailureCount: failed.length,
    lastFailureAt: lastFailureInWindow?.createdAt ?? null,
    lastSuccessAt: lastSuccess?.createdAt ?? null,
    recentlyRecovered: false,
    note: `${failed.length} technical failure${failed.length === 1 ? "" : "s"} of ${recent.length} emails in the last hour. A bounce or invalid-recipient rejection is not counted as a failure here.`,
  };
}

async function twilioStatus(): Promise<ServiceStatus> {
  const since = new Date(Date.now() - TWILIO_STATUS_WINDOW_MS);
  const [everSent, recent] = await Promise.all([
    prisma.authSmsSendLog.findFirst({ select: { id: true } }),
    prisma.authSmsSendLog.findMany({
      where: { createdAt: { gte: since } },
      select: { deliveryStatus: true, errorCode: true, createdAt: true },
    }),
  ]);

  if (!everSent) return unknown("Twilio", "No SMS has been sent through this yet.");

  // Recipient-specific carrier/number problems (bad number, unreachable
  // handset, opted-out landline, etc.) are not a Twilio/provider issue —
  // see twilioHealth.ts's classifier for the exact code list.
  const technicalFailures = recent.filter((r) => (r.deliveryStatus === "FAILED" || r.deliveryStatus === "UNDELIVERED") && !isRecipientSpecificTwilioError(r.errorCode));
  const lastSuccess = recent.filter((r) => r.deliveryStatus === "DELIVERED" || r.deliveryStatus === "SENT").sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  const lastFailureInWindow = technicalFailures.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  const status = classifyByRate(technicalFailures.length, recent.length, TWILIO_FAILURE_RATE_WARNING, TWILIO_FAILURE_RATE_CRITICAL);

  return {
    service: "Twilio",
    status,
    recentFailureCount: technicalFailures.length,
    lastFailureAt: lastFailureInWindow?.createdAt ?? null,
    lastSuccessAt: lastSuccess?.createdAt ?? null,
    recentlyRecovered: false,
    note: `${technicalFailures.length} technical failure${technicalFailures.length === 1 ? "" : "s"} of ${recent.length} SMS in the last hour. A bad number or opt-out is not counted as a failure here.`,
  };
}

async function aplosStatus(): Promise<ServiceStatus> {
  const since = new Date(Date.now() - APLOS_STATUS_WINDOW_MS);
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
  const lastFailureInWindow = failed.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
  const status = classifyByRate(failed.length, recent.length, APLOS_FAILURE_RATE_WARNING, APLOS_FAILURE_RATE_CRITICAL);

  return {
    service: "Aplos",
    status,
    recentFailureCount: failed.length,
    lastFailureAt: lastFailureInWindow?.updatedAt ?? null,
    lastSuccessAt: lastSuccess?.updatedAt ?? null,
    recentlyRecovered: false,
    note: `${failed.length} failed/needs-review of ${recent.length} sync records touched in the last hour.`,
  };
}

/**
 * Webhook health considers TWO independent signals, whichever is worse
 * wins: (1) the processing failure rate, same idea as every other
 * rate-based service, and (2) backlog — events still PENDING well past
 * when they should have finished, which a pure failure-rate view can miss
 * entirely (a webhook stuck retrying forever is neither "failed" nor
 * "succeeded" in the processingStatus column).
 */
async function webhooksStatus(): Promise<ServiceStatus> {
  const since = new Date(Date.now() - WEBHOOK_STATUS_WINDOW_MS);
  const staleBefore = new Date(Date.now() - WEBHOOK_PENDING_AGE_THRESHOLD_MS);
  const [everReceived, recent, backlogCount] = await Promise.all([
    prisma.finixWebhookEvent.findFirst({ select: { id: true } }),
    prisma.finixWebhookEvent.findMany({
      where: { createdAt: { gte: since } },
      select: { processingStatus: true, createdAt: true },
    }),
    prisma.finixWebhookEvent.count({ where: { processingStatus: "PENDING", createdAt: { lt: staleBefore } } }),
  ]);

  if (!everReceived) return unknown("Webhooks", "No webhook events have been received yet.");

  const failed = recent.filter((r) => r.processingStatus === "ERROR" || r.processingStatus === "FAILED");
  const lastSuccess = recent.filter((r) => r.processingStatus === "COMPLETED").sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  const lastFailureInWindow = failed.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

  const rateStatus = classifyByRate(failed.length, recent.length, WEBHOOK_FAILURE_RATE_WARNING, WEBHOOK_FAILURE_RATE_CRITICAL);
  const backlogStatus: ServiceStatusValue = backlogCount >= WEBHOOK_BACKLOG_CRITICAL ? "OUTAGE" : backlogCount >= WEBHOOK_BACKLOG_WARNING ? "DEGRADED" : "OPERATIONAL";
  const severityRank: Record<ServiceStatusValue, number> = { UNKNOWN: -1, OPERATIONAL: 0, DEGRADED: 1, OUTAGE: 2 };
  const status = severityRank[backlogStatus] > severityRank[rateStatus] ? backlogStatus : rateStatus;

  return {
    service: "Webhooks",
    status,
    recentFailureCount: failed.length,
    lastFailureAt: lastFailureInWindow?.createdAt ?? null,
    lastSuccessAt: lastSuccess?.createdAt ?? null,
    recentlyRecovered: false,
    note:
      backlogCount > 0
        ? `${backlogCount} webhook${backlogCount === 1 ? "" : "s"} pending more than 5 minutes. ${failed.length} failed of ${recent.length} in the last hour.`
        : `${failed.length} failed of ${recent.length} webhook events in the last hour. No backlog.`,
  };
}

async function backgroundJobsStatus(): Promise<ServiceStatus> {
  // Confirmed in inspection: none of the 10 Vercel cron routes write to a
  // generic run-history table — they return a JSON summary and rely on
  // Vercel's own function logs. Nothing here to compute honestly yet;
  // Phase 4 is what adds a standardized JobRun-style record. Deliberately
  // left untouched in Phase 3 per the explicit instruction not to rush a
  // partial job-monitoring system in ahead of that phase.
  return unknown("Background Jobs", "No standardized job-run history exists yet (Phase 4).");
}

export async function getAllServiceStatuses(): Promise<ServiceStatus[]> {
  return Promise.all([wgcApiStatus(), supabaseStatus(), finixStatus(), resendStatus(), twilioStatus(), aplosStatus(), webhooksStatus(), backgroundJobsStatus()]);
}
