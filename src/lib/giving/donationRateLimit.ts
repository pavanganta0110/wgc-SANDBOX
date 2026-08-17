/**
 * Best-effort in-memory rate limiter for the public donation-submission
 * endpoint (src/app/api/g/[slug]/donate/route.ts) — same pattern as
 * src/lib/auth/adminAuthRateLimit.ts. Process-local (resets per serverless
 * instance), documented limitation, not hidden. Scoped per-IP-per-slug so
 * one high-traffic giving page doesn't throttle donors on another.
 *
 * Limit is intentionally generous (30/min) — this is meant to blunt
 * scripted abuse/retry-storms, not to interfere with a legitimate burst of
 * simultaneous donors on a popular giving link.
 */
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 30;

const attempts = new Map<string, number[]>();

export function checkDonationRateLimit(key: string): boolean {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  const recent = (attempts.get(key) ?? []).filter((t) => t > windowStart);
  if (recent.length >= MAX_ATTEMPTS) {
    attempts.set(key, recent);
    return false;
  }
  recent.push(now);
  attempts.set(key, recent);
  return true;
}
