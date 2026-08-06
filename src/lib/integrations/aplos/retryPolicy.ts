/**
 * Automatic-retry backoff schedule for AplosSyncRecord. Aplos documents no
 * rate limit and no recommended retry interval for the Contributions API
 * (confirmed absent — see docs/integrations/aplos.md "Open Items"), so this
 * schedule is WGC's own conservative choice, not an Aplos-documented value.
 *
 * Only ever applied to records classified as automatically retryable per
 * errors.ts (`retryable: true`) — an AMBIGUOUS_RESULT (NEEDS_REVIEW) never
 * reaches this function, and is never eligible for any of these attempts.
 */

const BASE_DELAY_MS = 5 * 60 * 1000; // 5 minutes
const MAX_DELAY_MS = 6 * 60 * 60 * 1000; // 6 hours

/** Automatic (cron-driven) retries stop after this many attempts — beyond
 * this, the record becomes a terminal FAILED requiring a merchant- or
 * admin-initiated manual retry (Checkpoint 8 UI), not indefinite background
 * retrying. */
export const MAX_AUTOMATIC_RETRY_ATTEMPTS = 5;

/** Exponential backoff, doubling from BASE_DELAY_MS, capped at
 * MAX_DELAY_MS. attemptCount is the count *after* the attempt that just
 * failed (i.e. 1 for the first failure). */
export function computeNextAttemptDelayMs(attemptCount: number): number {
  const exponent = Math.max(0, attemptCount - 1);
  const delay = BASE_DELAY_MS * Math.pow(2, exponent);
  return Math.min(delay, MAX_DELAY_MS);
}

export function computeNextAttemptAt(attemptCount: number, now: Date = new Date()): Date {
  return new Date(now.getTime() + computeNextAttemptDelayMs(attemptCount));
}
