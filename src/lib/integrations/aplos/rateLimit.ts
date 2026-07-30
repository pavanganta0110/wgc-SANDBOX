/**
 * Best-effort in-memory rate limiter for Aplos connection-test/connect
 * attempts — same pattern as src/lib/auth/adminAuthRateLimit.ts. Process-
 * local (resets per serverless instance), documented limitation, not
 * hidden. Keyed by churchId so one organization's repeated attempts (e.g.
 * a merchant retrying a wrong private key) can't exhaust another's budget,
 * and so it also happens to protect against triggering Aplos's own
 * documented abuse-detection on the token endpoint (their guidance: don't
 * request a new token faster than once per 30 minutes under normal use).
 */
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;

const attempts = new Map<string, number[]>();

export function checkAplosConnectionRateLimit(churchId: string): boolean {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  const recent = (attempts.get(churchId) ?? []).filter((t) => t > windowStart);
  if (recent.length >= MAX_ATTEMPTS) {
    attempts.set(churchId, recent);
    return false;
  }
  recent.push(now);
  attempts.set(churchId, recent);
  return true;
}

/** Test-only: clears rate-limit state between test cases. */
export function __resetAplosConnectionRateLimitForTests(): void {
  attempts.clear();
}
