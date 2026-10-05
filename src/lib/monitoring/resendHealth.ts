import { recordHealthEvent } from "./healthEvents";

/**
 * Resend technical-failure classification — called from src/lib/email.ts's
 * sendWgcEmail(), the single function every email send in this app already
 * goes through (per "reuse the existing send path, don't create duplicate
 * email logging"). OrgEmailLog remains the source of truth for send
 * history; this only adds a System Health signal for genuine provider
 * problems, distinct from an ordinary recipient-side outcome.
 *
 * Resend's synchronous send response only ever reports request-time
 * problems (bad API key, malformed request, rate limit, its own 5xx) — a
 * bounce or spam-complaint arrives later via a webhook this codebase
 * doesn't currently receive (confirmed: no Resend webhook route exists),
 * so there is no "recipient rejected it" case to misclassify here today.
 * The one real recipient-side case Resend DOES reject synchronously is a
 * malformed/invalid email address, which is a data problem on our side or
 * the merchant's, not a provider outage — explicitly excluded below.
 */

const RESEND_BUSINESS_ERROR_NAMES = new Set([
  "validation_error",
  "invalid_parameter",
  "invalid_region",
  "invalid_from_address",
  "invalid_to_address",
  "invalid_attachment",
  "missing_required_field",
  "not_found",
]);

const RESEND_AUTH_ERROR_NAMES = new Set(["missing_api_key", "invalid_api_key", "restricted_api_key", "invalid_access"]);

export type ResendFailureKind = "AUTH_FAILURE" | "RATE_LIMITED" | "PROVIDER_ERROR" | "NETWORK_ERROR" | "UNKNOWN_TECHNICAL";

/**
 * Returns null when the failure is a normal recipient/request outcome that
 * must NOT be recorded as a System Health event — the caller should skip
 * recordHealthEvent entirely in that case.
 */
export function classifyResendFailure(error: unknown, wasException: boolean): { kind: ResendFailureKind; severity: "WARNING" | "ERROR" | "CRITICAL" } | null {
  if (wasException) {
    // Resend's SDK call itself threw (network failure, timeout, DNS,
    // etc.) — Resend never got the chance to answer at all.
    return { kind: "NETWORK_ERROR", severity: "ERROR" };
  }

  const name = (error as { name?: string } | undefined)?.name;
  if (!name) return { kind: "UNKNOWN_TECHNICAL", severity: "ERROR" };
  if (RESEND_BUSINESS_ERROR_NAMES.has(name)) return null;
  if (RESEND_AUTH_ERROR_NAMES.has(name)) return { kind: "AUTH_FAILURE", severity: "CRITICAL" };
  if (name === "rate_limit_exceeded") return { kind: "RATE_LIMITED", severity: "WARNING" };
  if (name === "internal_server_error" || name === "application_error") return { kind: "PROVIDER_ERROR", severity: "CRITICAL" };
  // An unrecognized error name defaults to technical/visible rather than
  // silently dropped — the safer direction to be wrong in for a monitoring
  // signal (see the same reasoning in twilioHealth.ts and finixHealth.ts).
  return { kind: "UNKNOWN_TECHNICAL", severity: "ERROR" };
}

export function recordResendTechnicalFailure(params: {
  error: unknown;
  wasException: boolean;
  category?: string;
  churchId?: string;
  recipientDomain?: string;
}): void {
  const classification = classifyResendFailure(params.error, params.wasException);
  if (!classification) return; // a normal recipient/request outcome, not a provider issue

  const message =
    params.error instanceof Error
      ? params.error.message
      : typeof params.error === "object" && params.error !== null && "message" in params.error
        ? String((params.error as { message: unknown }).message)
        : "Resend send failed";

  void recordHealthEvent({
    service: "Resend",
    integration: "resend",
    operation: params.category,
    status: "FAILED",
    severity: classification.severity,
    merchantId: params.churchId,
    errorCode: (params.error as { name?: string } | undefined)?.name,
    message,
    metadata: { kind: classification.kind, recipientDomain: params.recipientDomain },
  }).catch((err) => {
    console.error("[recordResendTechnicalFailure] failed to record health event:", err);
  });
}
