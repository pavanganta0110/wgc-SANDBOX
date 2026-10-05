import { recordHealthEvent, type HealthEventSeverity } from "./healthEvents";
import { generateRequestId } from "./requestId";
import { FINIX_RATE_LIMIT_SEVERITY } from "./thresholds";

/**
 * Finix technical-failure classification and recording — the ONLY place
 * this app decides "is this a Finix infrastructure problem." Called
 * exclusively from src/lib/finix/client.ts's fetchApi(), the single choke
 * point every Finix API call already goes through, per the instruction to
 * instrument the centralized client rather than dozens of call sites.
 *
 * CRITICAL invariant this whole module exists to protect: a business
 * outcome (card declined, insufficient funds, invalid card, ACH return,
 * business-rule validation) is NEVER represented as a thrown Error from
 * fetchApi() — Finix returns those as a 200/201 response body with
 * `state: "FAILED"` and a `failure_code`, handled entirely by
 * src/lib/finix/cardDeclineReasons.ts and friends, which this module never
 * touches. Everything recorded here is, by construction, something that
 * happened BEFORE or INSTEAD OF getting a real business answer from Finix —
 * a timeout, a network failure, a broken credential, a 5xx, a malformed
 * response, or an unexpected 4xx that isn't one of the three auth/rate-limit
 * cases already called out separately.
 */

export type FinixFailureKind = "TIMEOUT" | "NETWORK_ERROR" | "AUTH_FAILURE" | "RATE_LIMITED" | "SERVER_ERROR" | "CLIENT_ERROR" | "MALFORMED_RESPONSE";

function severityForFinixFailure(kind: FinixFailureKind): HealthEventSeverity {
  switch (kind) {
    case "AUTH_FAILURE":
    case "SERVER_ERROR":
      // A broken credential or a Finix-side 5xx affects every subsequent
      // call, not just this one operation.
      return "CRITICAL";
    case "RATE_LIMITED":
      return FINIX_RATE_LIMIT_SEVERITY;
    case "TIMEOUT":
    case "NETWORK_ERROR":
    case "CLIENT_ERROR":
    case "MALFORMED_RESPONSE":
      return "ERROR";
  }
}

/**
 * Strips a Finix resource path down to a stable operation label —
 * "/transfers/TRxxxxxxxxxxxx/reversals" -> "/transfers/:id/reversals" — so
 * SystemErrorGroup groups every reversal-timeout together instead of one
 * group per distinct transfer id. Also strips query strings and, for an
 * absolute URL (fetchByHref), the scheme+host.
 */
export function normalizeFinixOperation(pathOrUrl: string): string {
  let path = pathOrUrl;
  try {
    if (/^https?:\/\//i.test(pathOrUrl)) {
      path = new URL(pathOrUrl).pathname;
    } else {
      path = pathOrUrl.split("?")[0];
    }
  } catch {
    path = pathOrUrl.split("?")[0];
  }
  return path
    .split("/")
    .map((segment) => (isLikelyFinixId(segment) ? ":id" : segment))
    .join("/");
}

/**
 * Every static Finix resource path segment in this client (identities,
 * payment_instruments, fee_profiles, settlement_queue_entries,
 * apple_pay_sessions, compliance_forms, ...) is a lowercase English word,
 * optionally underscore-separated, and — critically — never contains a
 * digit. A real Finix-issued id (transfer/merchant/settlement/etc.) always
 * does (e.g. "TR4a9f8e2c1b3d4e5f"), so "contains a digit" is a clean,
 * reliable signal here — far more reliable than a length threshold alone,
 * which false-positives on legitimately long resource names like
 * "fee_profiles" or "settlement_queue_entries".
 */
function isLikelyFinixId(segment: string): boolean {
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) return false;
  if (/[0-9]/.test(segment)) return true;
  // Fallback for an all-letter id (rare, but not impossible) — long AND
  // has no underscore, since every real resource-name segment in this
  // client is underscore-separated when it's more than one word.
  return segment.length >= 20 && !segment.includes("_");
}

/**
 * Best-effort extraction of a Finix-issued error code from a parsed error
 * response body. Finix's documented error envelope is
 * `{ _embedded: { errors: [{ code, message, logref }] } }` — if the actual
 * shape differs, this just returns undefined rather than throwing, since
 * getting this wrong must never break error handling.
 */
export function extractFinixErrorCode(data: unknown): string | undefined {
  try {
    const embedded = (data as { _embedded?: { errors?: { code?: string }[] } })?._embedded;
    return embedded?.errors?.[0]?.code;
  } catch {
    return undefined;
  }
}

export interface FinixFailureContext {
  path: string;
  method: string;
  httpStatus: number | null;
  kind: FinixFailureKind;
  message: string;
  finixErrorCode?: string;
  requestId: string;
  durationMs?: number;
  attempt?: number;
}

/**
 * Fire-and-forget: never awaited by fetchApi, never allowed to throw or
 * delay the caller. A monitoring failure must never become a payment
 * failure.
 */
export function recordFinixTechnicalFailure(ctx: FinixFailureContext): void {
  const operation = normalizeFinixOperation(ctx.path);
  void recordHealthEvent({
    service: "Finix",
    integration: "finix",
    operation,
    route: operation,
    status: "FAILED",
    severity: severityForFinixFailure(ctx.kind),
    requestId: ctx.requestId,
    message: ctx.message,
    metadata: {
      kind: ctx.kind,
      method: ctx.method,
      httpStatus: ctx.httpStatus,
      finixErrorCode: ctx.finixErrorCode,
      durationMs: ctx.durationMs,
      attempt: ctx.attempt,
    },
  }).catch((err) => {
    console.error("[recordFinixTechnicalFailure] failed to record health event:", err);
  });
}

/** One requestId per Finix API call, generated inside fetchApi so it can be attached to the thrown error for a caller that also reports to Sentry to correlate against — see captureError.ts's ErrorContext.requestId. */
export function newFinixRequestId(): string {
  return generateRequestId();
}
