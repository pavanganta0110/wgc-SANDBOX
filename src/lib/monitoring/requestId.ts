/**
 * Generates a fresh request/correlation id, e.g. "req_3f9a1c2b4d5e6f70".
 * This is the app-wide version of what previously lived only in
 * src/lib/api/response.ts for the /api/v1 partner API — that module now
 * re-exports this one for backward compatibility, so every existing caller
 * keeps working unchanged. Any route (admin, merchant, webhook, cron) can
 * mint one of these and thread it through captureError()'s requestId option
 * so a technical exception in Sentry and the corresponding WGC System
 * Health record point at the same id.
 *
 * Deliberately uses the Web Crypto API (globalThis.crypto), not Node's
 * `crypto` module, so this works unchanged in both the Node.js runtime and
 * Vercel's Edge runtime (e.g. src/middleware.ts) without a separate
 * edge-safe variant — same reasoning as src/middleware.ts's own HMAC
 * verification using Web Crypto instead of Node's crypto.
 */
export function generateRequestId(): string {
  return `req_${crypto.randomUUID().replace(/-/g, "")}`;
}

/**
 * Reads an inbound x-request-id header if the caller already has one (a
 * future edge-level injection, or a client that generated its own),
 * otherwise mints a fresh one. Never throws.
 */
export function getOrCreateRequestId(headers?: Headers | null): string {
  try {
    const existing = headers?.get("x-request-id");
    if (existing) return existing;
  } catch {
    // fall through to generating a fresh id
  }
  return generateRequestId();
}
