/**
 * Centralized expected-cadence/staleness/criticality config for every
 * monitored background job — one source of truth instead of scattering
 * "how often should this run" knowledge across the codebase. Schedules
 * below are copied directly from vercel.json; if that file changes, this
 * must be updated to match (there is no way to derive one from the other
 * automatically without parsing vercel.json at runtime, which is more
 * complexity than this warrants for ~10 known jobs).
 *
 * `critical: true` means a failure or staleness on this job should be able
 * to push the Background Jobs service card (and a resulting incident) to
 * OUTAGE, not just Degraded — reserved for jobs with real financial/
 * merchant impact if they silently stop. A minor administrative job
 * failing must never read as "the platform is down."
 */

export interface JobConfig {
  jobName: string;
  jobType: string;
  /** Human label for the admin UI. */
  label: string;
  /** How often this job is expected to run, per vercel.json. */
  expectedIntervalMs: number;
  /** No successful run within this long since the last one → considered STALE. Always somewhat larger than expectedIntervalMs to tolerate a single missed/delayed run without false-alarming. */
  staleAfterMs: number;
  critical: boolean;
  /**
   * Whether the admin "Retry" button on this job's detail page is allowed
   * to exist at all — true ONLY for a job whose action is genuinely
   * idempotent and never creates or reverses a charge (re-running it just
   * repairs/re-checks state that a normal scheduled run would also have
   * touched). `release-settlement-queue` is the deliberate example of a job
   * that stays false: re-running it has a real, immediate financial effect
   * (it releases settlement funds), so it is never exposed as a one-click
   * retry from this dashboard, however "idempotent" its dedup logic is.
   */
  retrySafe: boolean;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const JOB_CONFIGS: Record<string, JobConfig> = {
  reconcile: {
    jobName: "reconcile",
    jobType: "settlement",
    label: "Settlement Reconciliation",
    expectedIntervalMs: DAY,
    staleAfterMs: DAY + 4 * HOUR,
    critical: true,
    // Never creates a charge/reversal — only re-syncs settlements, replays
    // failed webhook events, and flags (never auto-resolves) orphaned
    // charges for a human. Matches the codebase's own reconciliation
    // principle (see CLAUDE.md): safe to re-run on demand.
    retrySafe: true,
  },
  "invoice-reminders": {
    jobName: "invoice-reminders",
    jobType: "email",
    label: "Invoice Reminders",
    expectedIntervalMs: DAY,
    staleAfterMs: DAY + 6 * HOUR,
    critical: false,
    retrySafe: true, // email delivery only — an explicit "safe" example in the design doc
  },
  "event-emails": {
    jobName: "event-emails",
    jobType: "email",
    label: "Event Reminder & Thank-you Emails",
    expectedIntervalMs: DAY,
    staleAfterMs: DAY + 6 * HOUR,
    critical: false,
    retrySafe: true, // claim-before-send markers make a re-run a no-op for anything already sent
  },
  "scheduled-campaigns": {
    jobName: "scheduled-campaigns",
    jobType: "email",
    label: "Monthly Giving Campaigns",
    expectedIntervalMs: DAY,
    staleAfterMs: DAY + 6 * HOUR,
    critical: false,
    retrySafe: true, // each monthly run is claimed in the database first, so a re-run can't double-send
  },
  "reconcile-subscriptions": {
    jobName: "reconcile-subscriptions",
    jobType: "billing",
    label: "WGC Subscription Reconciliation",
    expectedIntervalMs: DAY,
    staleAfterMs: DAY + 4 * HOUR,
    critical: true,
    retrySafe: true, // flags discrepancies for a human — never mutates a subscription or triggers a charge itself
  },
  "promo-shortfall-check": {
    jobName: "promo-shortfall-check",
    jobType: "billing",
    label: "Promo Shortfall Check",
    expectedIntervalMs: 30 * DAY,
    staleAfterMs: 33 * DAY,
    critical: false,
    retrySafe: true, // detection/flagging only, no charge
  },
  "sms-addon-overage-check": {
    jobName: "sms-addon-overage-check",
    jobType: "billing",
    label: "SMS Add-on Overage Check",
    expectedIntervalMs: 30 * DAY,
    staleAfterMs: 33 * DAY,
    critical: false,
    retrySafe: true, // detection/flagging only, no charge
  },
  "resync-transfer-fees": {
    jobName: "resync-transfer-fees",
    jobType: "finix",
    label: "Finix Transfer Fee Sync",
    expectedIntervalMs: DAY,
    staleAfterMs: DAY + 6 * HOUR,
    critical: false,
    retrySafe: true, // syncFeesForTransfer upserts on finixFeeId — re-running can only fill in missing fee rows, never double-charge
  },
  "resync-monthly-transfer-fees": {
    jobName: "resync-monthly-transfer-fees",
    jobType: "finix",
    label: "Finix Monthly Transfer Fee Sync",
    expectedIntervalMs: 30 * DAY,
    staleAfterMs: 33 * DAY,
    critical: false,
    retrySafe: true, // same idempotent fee upsert as resync-transfer-fees
  },
  "release-settlement-queue": {
    jobName: "release-settlement-queue",
    jobType: "settlement",
    label: "Settlement Queue Release",
    expectedIntervalMs: DAY,
    staleAfterMs: DAY + 4 * HOUR,
    critical: true,
    // NOT retry-safe — this job actually releases settlement funds to a
    // merchant's bank via Finix. A manual re-trigger from a monitoring
    // dashboard is exactly the kind of "blind retry on a payment operation"
    // the design doc prohibits, regardless of how idempotent its own
    // ready-to-settle filtering is.
    retrySafe: false,
  },
  "webhook-retry": {
    jobName: "webhook-retry",
    jobType: "webhook",
    label: "Webhook Retry",
    expectedIntervalMs: DAY,
    staleAfterMs: DAY + 6 * HOUR,
    critical: false,
    retrySafe: true, // "some webhook reprocessing" — an explicit "safe" example in the design doc
  },
  "aplos-sync": {
    jobName: "aplos-sync",
    jobType: "aplos",
    label: "Aplos Sync",
    // Not yet registered in vercel.json (deliberately deferred — see that
    // route's own comment) — excluded from staleness detection via
    // isActivelyScheduled() below rather than given a real cadence, since
    // "never runs yet" would otherwise immediately and incorrectly report
    // as stale.
    expectedIntervalMs: DAY,
    staleAfterMs: Infinity,
    critical: false,
    retrySafe: true, // "Aplos sync" — an explicit "safe" example in the design doc
  },
  "system-health-sweep": {
    jobName: "system-health-sweep",
    jobType: "monitoring",
    label: "System Health Sweep",
    expectedIntervalMs: DAY,
    staleAfterMs: DAY + 4 * HOUR,
    critical: false,
    retrySafe: true, // pure internal monitoring maintenance — no external/financial side effects
  },
};

/** Jobs currently registered in vercel.json's crons array and therefore eligible for staleness detection. aplos-sync exists as code but isn't scheduled yet. */
export const ACTIVELY_SCHEDULED_JOB_NAMES = Object.keys(JOB_CONFIGS).filter((name) => name !== "aplos-sync");

export function getJobConfig(jobName: string): JobConfig | undefined {
  return JOB_CONFIGS[jobName];
}

export function isActivelyScheduled(jobName: string): boolean {
  return ACTIVELY_SCHEDULED_JOB_NAMES.includes(jobName);
}

/** Single source of truth for whether a job's admin-UI "Retry" button may exist at all — see JobConfig.retrySafe. */
export function isRetrySafe(jobName: string): boolean {
  return JOB_CONFIGS[jobName]?.retrySafe ?? false;
}
