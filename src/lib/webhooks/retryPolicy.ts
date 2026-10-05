/**
 * Exponential backoff schedule for outbound webhook retries, and the
 * auto-disable threshold for a chronically-failing endpoint. Small, hand-
 * rolled, in-code — matches this codebase's existing convention of a
 * dedicated policy module per feature rather than a generic job-queue
 * library (see src/lib/integrations/aplos/retryPolicy.ts for the same
 * pattern applied to Aplos sync retries).
 */

// Delay before each successive retry attempt, in seconds. Attempt 1 is the
// immediate delivery on emitEvent(); these are the delays before attempts
// 2 through 6. After the schedule is exhausted, the delivery is marked
// ABANDONED rather than retried forever.
const RETRY_DELAYS_SECONDS = [60, 5 * 60, 30 * 60, 2 * 60 * 60, 12 * 60 * 60];

export const MAX_DELIVERY_ATTEMPTS = RETRY_DELAYS_SECONDS.length + 1;

/** Consecutive failed deliveries (across all events) before an endpoint is
 * automatically disabled — a merchant re-enables it manually once they've
 * fixed their receiving server. */
export const AUTO_DISABLE_FAILURE_THRESHOLD = 20;

export function nextRetryDelaySeconds(attemptCountSoFar: number): number | null {
  // attemptCountSoFar=1 means the immediate delivery already happened;
  // the next retry is RETRY_DELAYS_SECONDS[0].
  const index = attemptCountSoFar - 1;
  if (index < 0 || index >= RETRY_DELAYS_SECONDS.length) return null;
  return RETRY_DELAYS_SECONDS[index];
}

export function computeNextRetryAt(attemptCountSoFar: number, from: Date = new Date()): Date | null {
  const delay = nextRetryDelaySeconds(attemptCountSoFar);
  if (delay === null) return null;
  return new Date(from.getTime() + delay * 1000);
}
