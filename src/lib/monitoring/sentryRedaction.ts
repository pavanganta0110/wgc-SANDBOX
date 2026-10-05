import type { ErrorEvent } from "@sentry/nextjs";
import { redactSensitiveData } from "@/lib/utils/errorNormalizer";

/**
 * Sentry's own `beforeSend`/`beforeSendTransaction` hook — the last line of
 * defense before ANY event leaves this app for Sentry's servers. Reuses the
 * exact same key/value redaction already trusted for the WGC-XXXXXX support
 * log path (errorNormalizer.ts) rather than inventing a second scrubbing
 * implementation, so "never send sensitive data to Sentry" and "never log
 * sensitive data internally" stay backed by one rule set, not two that can
 * drift apart.
 *
 * Strips, in addition to redactSensitiveData's own key-based scrubbing:
 *  - the Authorization / Cookie request headers (never useful for debugging
 *    a bug, always sensitive)
 *  - request cookies entirely
 *  - request body data (POST payloads routinely carry donor PII, card
 *    tokens, or Finix identity fields — redactSensitiveData recurses into
 *    it, but request bodies are large/arbitrary-shaped enough that we drop
 *    them outright rather than trust key-name matching alone)
 */
export function scrubSentryEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    if (event.request.headers) {
      const headers = { ...event.request.headers };
      delete headers["authorization"];
      delete headers["Authorization"];
      delete headers["cookie"];
      delete headers["Cookie"];
      event.request.headers = headers;
    }
    delete event.request.cookies;
    delete event.request.data;
  }

  if (event.extra) {
    event.extra = redactSensitiveData(event.extra) as typeof event.extra;
  }
  if (event.contexts) {
    for (const key of Object.keys(event.contexts)) {
      // "trace"/"runtime"/"app"/"device"/"culture" contexts are Sentry's own
      // safe, structural metadata — never redact those. Only scrub
      // free-form/custom contexts we or our helpers attach.
      if (["trace", "runtime", "app", "device", "culture", "os", "browser"].includes(key)) continue;
      event.contexts[key] = redactSensitiveData(event.contexts[key]) as Record<string, unknown>;
    }
  }

  return event;
}
