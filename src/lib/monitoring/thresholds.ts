import type { HealthEventSeverity } from "./healthEvents";

/**
 * Every magic number the System Health service-status computation uses,
 * in one place. Nothing here needs to be an environment variable — these
 * are sane application constants, not per-deployment configuration, and
 * keeping them as plain exported constants makes them directly importable
 * in tests without needing to stub process.env.
 */

// ─── Status windows — "recent" means different things for different services ──
// A Finix failure from three weeks ago must not make Finix look Degraded
// today; a single slow-drip Aplos sync issue is still meaningful an hour
// later. Each service's status function uses its own window rather than one
// global constant.
export const FINIX_STATUS_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const DATABASE_STATUS_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
export const RESEND_STATUS_WINDOW_MS = 60 * 60 * 1000; // 1 hour
export const TWILIO_STATUS_WINDOW_MS = 60 * 60 * 1000; // 1 hour
export const APLOS_STATUS_WINDOW_MS = 60 * 60 * 1000; // 1 hour
export const WEBHOOK_STATUS_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// ─── Finix ──────────────────────────────────────────────────────────────────
// Failure RATE (technical failures / total attempts in the window), not raw
// count — a high-volume merchant doing 500 refunds/hour with 3 timeouts is
// healthier than a quiet one doing 5 refunds with 3 timeouts.
export const FINIX_DEGRADED_FAILURE_RATE = 0.05; // 5%
export const FINIX_CRITICAL_FAILURE_RATE = 0.2; // 20%
// A rate-limit response is "operationally meaningful" per the design doc,
// but self-resolving and not itself an outage — recorded, never escalated
// into an open SystemErrorGroup by default.
export const FINIX_RATE_LIMIT_SEVERITY: HealthEventSeverity = "WARNING";

// ─── Supabase / database ────────────────────────────────────────────────────
// A single isolated Prisma error must never flip the whole database card —
// only a cluster of them inside the window does.
export const DB_DEGRADED_FAILURE_COUNT = 3;
export const DB_CRITICAL_FAILURE_COUNT = 10;

// ─── Resend ─────────────────────────────────────────────────────────────────
export const EMAIL_FAILURE_RATE_WARNING = 0.1; // 10%
export const EMAIL_FAILURE_RATE_CRITICAL = 0.4; // 40%

// ─── Twilio ─────────────────────────────────────────────────────────────────
export const TWILIO_FAILURE_RATE_WARNING = 0.1; // 10%
export const TWILIO_FAILURE_RATE_CRITICAL = 0.4; // 40%

// ─── Aplos ──────────────────────────────────────────────────────────────────
export const APLOS_FAILURE_RATE_WARNING = 0.15; // 15% — sync retries are already built into the Aplos engine itself, so a slightly higher bar than email/SMS is appropriate.
export const APLOS_FAILURE_RATE_CRITICAL = 0.5; // 50%

// ─── Webhooks ───────────────────────────────────────────────────────────────
export const WEBHOOK_BACKLOG_WARNING = 10; // pending events older than the age threshold below
export const WEBHOOK_BACKLOG_CRITICAL = 50;
export const WEBHOOK_PENDING_AGE_THRESHOLD_MS = 5 * 60 * 1000; // a webhook still PENDING after 5 minutes counts toward backlog
export const WEBHOOK_FAILURE_RATE_WARNING = 0.05;
export const WEBHOOK_FAILURE_RATE_CRITICAL = 0.2;
