/**
 * Best-effort in-memory rate limiter for the public invoice page and
 * payment routes — same pattern and same documented limitation as
 * setupLinkRateLimit.ts (process-local, not globally enforced on
 * serverless/multi-instance deployment).
 */
const WINDOW_MS = 60_000;
const VIEW_MAX_ATTEMPTS = 30;
const PAYMENT_MAX_ATTEMPTS = 10;

const viewAttempts = new Map<string, number[]>();
const paymentAttempts = new Map<string, number[]>();

function check(store: Map<string, number[]>, key: string, max: number): boolean {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  const recent = (store.get(key) ?? []).filter((t) => t > windowStart);
  if (recent.length >= max) {
    store.set(key, recent);
    return false;
  }
  recent.push(now);
  store.set(key, recent);
  return true;
}

export function checkInvoiceViewRateLimit(key: string): boolean {
  return check(viewAttempts, key, VIEW_MAX_ATTEMPTS);
}

export function checkInvoicePaymentRateLimit(key: string): boolean {
  return check(paymentAttempts, key, PAYMENT_MAX_ATTEMPTS);
}
