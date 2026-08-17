/**
 * Best-effort in-memory rate limiter for merchant login/forgot-password —
 * same pattern as src/lib/auth/adminAuthRateLimit.ts. Process-local
 * (resets per serverless instance), documented limitation, not hidden.
 */
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 8;

const attempts = new Map<string, number[]>();

export function checkMerchantAuthRateLimit(key: string): boolean {
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
