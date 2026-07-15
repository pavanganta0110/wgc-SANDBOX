/**
 * Best-effort in-memory rate limiter for the public setup-link endpoints.
 * Real and functional (not a no-op stub), but process-local — on serverless
 * or multi-instance deployment this resets per instance rather than being
 * globally enforced. Documented as a known limitation, not hidden.
 */
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 10;

const attempts = new Map<string, number[]>();

export function checkSetupLinkRateLimit(key: string): boolean {
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
