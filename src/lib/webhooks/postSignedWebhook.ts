import { signWebhookPayload } from "@/lib/webhooks/signing";

export const WEBHOOK_DELIVERY_TIMEOUT_MS = 10_000;
export const WEBHOOK_RESPONSE_SNIPPET_MAX_CHARS = 2000;

export interface SignedWebhookResult {
  ok: boolean;
  statusCode?: number;
  bodySnippet?: string;
  error?: string;
  /** The timestamp that was signed. */
  timestamp: number;
}

/**
 * POSTs one signed webhook body and reports the outcome. Never throws: a
 * network error, timeout or non-2xx is a normal result. Same headers and
 * signature scheme as the organization webhooks (see signing.ts), so one
 * verification routine on the receiving side handles both.
 */
export async function postSignedWebhook(params: { url: string; secret: string; rawBody: string; eventId: string; eventType: string }): Promise<SignedWebhookResult> {
  const timestamp = Math.floor(Date.now() / 1000);
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), WEBHOOK_DELIVERY_TIMEOUT_MS);
  try {
    const res = await fetch(params.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "WGC-Signature": signWebhookPayload(params.rawBody, params.secret, timestamp),
        "WGC-Event-Id": params.eventId,
        "WGC-Event-Type": params.eventType,
      },
      body: params.rawBody,
      signal: controller.signal,
    });
    const bodyText = await res.text().catch(() => "");
    return {
      ok: res.ok,
      statusCode: res.status,
      bodySnippet: bodyText.slice(0, WEBHOOK_RESPONSE_SNIPPET_MAX_CHARS),
      error: res.ok ? undefined : `HTTP ${res.status}`,
      timestamp,
    };
  } catch (err) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    return { ok: false, error: isAbort ? "Request timed out" : err instanceof Error ? err.message : "Unknown delivery error", timestamp };
  } finally {
    clearTimeout(timeoutHandle);
  }
}
