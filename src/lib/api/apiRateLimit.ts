/**
 * Best-effort in-memory rate limiter for /api/v1, keyed per API key. Same
 * shape/limitations as src/lib/giving/embedRateLimit.ts — process-local,
 * resets per serverless instance, documented not hidden.
 */
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_MINUTE = 120;

const requests = new Map<string, number[]>();

export function checkApiRateLimit(apiKeyId: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  const recent = (requests.get(apiKeyId) ?? []).filter((t) => t > windowStart);
  if (recent.length >= MAX_REQUESTS_PER_MINUTE) {
    requests.set(apiKeyId, recent);
    return { allowed: false, remaining: 0 };
  }
  recent.push(now);
  requests.set(apiKeyId, recent);
  return { allowed: true, remaining: MAX_REQUESTS_PER_MINUTE - recent.length };
}

export const API_RATE_LIMIT_PER_MINUTE = MAX_REQUESTS_PER_MINUTE;
