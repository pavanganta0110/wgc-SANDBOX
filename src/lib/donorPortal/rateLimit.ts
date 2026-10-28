/**
 * Best-effort in-memory sliding-window limiter (process-local, like the other
 * public-endpoint limiters here — it resets per serverless instance rather than
 * being globally enforced). Used to stop one address from being mailed repeatedly.
 */
const buckets = new Map<string, number[]>();

export function checkWindowRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (buckets.get(key) ?? []).filter((t) => t > now - windowMs);
  if (recent.length >= max) {
    buckets.set(key, recent);
    return false;
  }
  recent.push(now);
  buckets.set(key, recent);
  return true;
}
