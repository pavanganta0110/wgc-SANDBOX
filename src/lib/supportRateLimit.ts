/**
 * Best-effort in-memory rate limiter for the public /api/support endpoint.
 * Same shape/limitations as src/lib/giving/embedRateLimit.ts — process-local,
 * resets per serverless instance, documented not hidden.
 */
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;

const attempts = new Map<string, number[]>();

export function checkSupportRateLimit(key: string): boolean {
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
