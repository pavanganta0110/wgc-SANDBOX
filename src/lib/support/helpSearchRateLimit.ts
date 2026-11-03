/**
 * Best-effort in-memory limit for the Help Center search (process-local, resets per serverless instance — same
 * shape and limits as supportRateLimit.ts). Search is cheap and runs on our own server, so this only stops a
 * runaway client, not a determined one.
 */
const WINDOW_MS = 60_000;
const MAX_SEARCHES = 20;

const searches = new Map<string, number[]>();

export function checkHelpSearchRateLimit(key: string): boolean {
  const now = Date.now();
  const recent = (searches.get(key) ?? []).filter((t) => t > now - WINDOW_MS);
  if (recent.length >= MAX_SEARCHES) {
    searches.set(key, recent);
    return false;
  }
  recent.push(now);
  searches.set(key, recent);
  return true;
}
