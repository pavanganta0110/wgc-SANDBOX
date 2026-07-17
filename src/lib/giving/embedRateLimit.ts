/**
 * Best-effort in-memory rate limiter for the embed-settings save endpoint.
 * Same shape/limitations as src/lib/subscriptions/setupLinkRateLimit.ts —
 * process-local, resets per serverless instance, documented not hidden.
 */
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 15;

const attempts = new Map<string, number[]>();

export function checkEmbedRateLimit(key: string): boolean {
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
