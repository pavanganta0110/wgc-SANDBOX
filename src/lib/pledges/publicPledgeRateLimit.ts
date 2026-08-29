/**
 * Best-effort in-memory rate limiter for the public self-service pledge
 * endpoint, same pattern and same documented limitation as
 * setupLinkRateLimit.ts — process-local, resets per instance on
 * serverless/multi-instance deployment.
 */
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;

const attempts = new Map<string, number[]>();

export function checkPublicPledgeRateLimit(key: string): boolean {
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
