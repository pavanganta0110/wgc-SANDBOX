/**
 * Best-effort in-memory rate limiter for the public campaign feed endpoint
 * (polled by the live donation wall). Same shape/limitations as
 * src/lib/giving/embedRateLimit.ts — process-local, resets per serverless
 * instance, documented not hidden. Allowance is generous (a wall polling
 * every 5s is ~12 requests/min) to leave headroom for several displays
 * behind one shared/NAT'd IP.
 */
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60;

const requests = new Map<string, number[]>();

export function checkCampaignFeedRateLimit(key: string): boolean {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  const recent = (requests.get(key) ?? []).filter((t) => t > windowStart);
  if (recent.length >= MAX_REQUESTS) {
    requests.set(key, recent);
    return false;
  }
  recent.push(now);
  requests.set(key, recent);
  return true;
}
