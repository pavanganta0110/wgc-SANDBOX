/**
 * Normalized error categories for the QuickBooks integration, following the
 * same shape as src/lib/integrations/aplos/errors.ts. Intuit's fault codes
 * are documented at developer.intuit.com ("Handle exceptions and errors") —
 * this mapping covers the ones relevant to server-to-server API calls
 * (AuthenticationFault / AuthorizationFault / ValidationFault / SystemFault),
 * not the OAuth-consent-screen-only error codes.
 */

export type QuickBooksErrorCategory =
  | "AUTHENTICATION_REQUIRED"
  | "ACCESS_DENIED"
  | "INVALID_CONFIGURATION"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "TEMPORARY_INTUIT_ERROR"
  | "STALE_OBJECT"
  | "INVALID_GRANT"
  | "UNKNOWN_ERROR";

export interface NormalizedQuickBooksError {
  category: QuickBooksErrorCategory;
  /** Merchant-safe message — never the raw Intuit fault detail verbatim. */
  safeMessage: string;
  retryable: boolean;
  /** Intuit's own fault `code`, when known — kept for internal diagnosis
   * only, never shown to the merchant as the primary message. */
  intuitFaultCode?: string;
  /** Intuit's own request-tracing header (`intuit_tid`) from the response
   * that produced this error — Intuit support asks for this on every
   * ticket, so it's captured on every failed request (see resourceClient.ts
   * and authProvider.ts) even though it's never shown to the merchant. */
  intuitTid?: string;
  /** The raw Fault.Error[].Detail/Message text from Intuit's own response,
   * or the OAuth error_description — internal-diagnosis only, same rule
   * as intuitFaultCode: never surfaced as the merchant-facing message. */
  rawDetail?: string;
}

export class QuickBooksConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuickBooksConfigError";
  }
}

export class QuickBooksConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuickBooksConnectionError";
  }
}

export class QuickBooksApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "QuickBooksApiError";
    this.status = status;
    this.body = body;
  }
}

/** Intuit fault codes seen in QBO Accounting API error responses
 * (response.Fault.Error[].code) — every code documented in Intuit's
 * "Errors" reference as of this build is present; undocumented codes map
 * to UNKNOWN_ERROR rather than guessing a category. */
const INTUIT_FAULT_CODE_MAP: Record<string, { category: QuickBooksErrorCategory; retryable: boolean }> = {
  "3200": { category: "AUTHENTICATION_REQUIRED", retryable: true }, // AuthenticationFailed
  "3100": { category: "ACCESS_DENIED", retryable: false }, // AuthorizationFailed / insufficient scope
  "610": { category: "ACCESS_DENIED", retryable: false }, // Object Not Found (treated as access/config, never retried blindly)
  "6000": { category: "VALIDATION_ERROR", retryable: false }, // Generic validation fault (business rule)
  "6190": { category: "STALE_OBJECT", retryable: false }, // Stale Object Error — SyncToken mismatch, caller must re-fetch and retry with fresh token
  "6240": { category: "VALIDATION_ERROR", retryable: false }, // Duplicate Document Number
  "500": { category: "TEMPORARY_INTUIT_ERROR", retryable: true }, // Internal Server Error
  "503": { category: "TEMPORARY_INTUIT_ERROR", retryable: true }, // Service Unavailable
  "429": { category: "RATE_LIMITED", retryable: true },
};

export function classifyIntuitFaultCode(code: string): NormalizedQuickBooksError {
  const mapped = INTUIT_FAULT_CODE_MAP[code];
  if (mapped) {
    return {
      category: mapped.category,
      retryable: mapped.retryable,
      intuitFaultCode: code,
      safeMessage: intuitCategorySafeMessage(mapped.category),
    };
  }
  return { category: "UNKNOWN_ERROR", retryable: false, intuitFaultCode: code, safeMessage: intuitCategorySafeMessage("UNKNOWN_ERROR") };
}

export function classifyHttpStatus(status: number): NormalizedQuickBooksError {
  if (status === 401) return { category: "AUTHENTICATION_REQUIRED", retryable: true, safeMessage: intuitCategorySafeMessage("AUTHENTICATION_REQUIRED") };
  if (status === 403) return { category: "ACCESS_DENIED", retryable: false, safeMessage: intuitCategorySafeMessage("ACCESS_DENIED") };
  if (status === 429) return { category: "RATE_LIMITED", retryable: true, safeMessage: intuitCategorySafeMessage("RATE_LIMITED") };
  if (status >= 500) return { category: "TEMPORARY_INTUIT_ERROR", retryable: true, safeMessage: intuitCategorySafeMessage("TEMPORARY_INTUIT_ERROR") };
  if (status === 400) return { category: "VALIDATION_ERROR", retryable: false, safeMessage: intuitCategorySafeMessage("VALIDATION_ERROR") };
  return { category: "UNKNOWN_ERROR", retryable: false, safeMessage: intuitCategorySafeMessage("UNKNOWN_ERROR") };
}

/**
 * The OAuth token endpoint (postToTokenEndpoint) returns errors in the
 * standard OAuth2 shape ({ error, error_description }), not Intuit's
 * Accounting-API fault-code format above — `invalid_grant` specifically
 * means the refresh token itself is dead (expired, revoked, or already
 * used — Intuit rotates it on every refresh), which always requires the
 * merchant to reconnect; it is never worth blindly retrying.
 */
export function classifyTokenEndpointError(status: number, body: unknown): NormalizedQuickBooksError {
  const errorBody = body && typeof body === "object" ? (body as { error?: unknown; error_description?: unknown }) : undefined;
  const rawDetail = typeof errorBody?.error_description === "string" ? errorBody.error_description : undefined;
  if (errorBody?.error === "invalid_grant") {
    return {
      category: "INVALID_GRANT",
      retryable: false,
      intuitFaultCode: "invalid_grant",
      safeMessage: intuitCategorySafeMessage("INVALID_GRANT"),
      rawDetail,
    };
  }
  return { ...classifyHttpStatus(status), rawDetail };
}

export function classifyNetworkOrTimeoutError(): NormalizedQuickBooksError {
  return { category: "TEMPORARY_INTUIT_ERROR", retryable: true, safeMessage: "Could not reach QuickBooks. Please try again in a moment." };
}

function intuitCategorySafeMessage(category: QuickBooksErrorCategory): string {
  switch (category) {
    case "AUTHENTICATION_REQUIRED":
      return "This organization's QuickBooks connection has expired. Please reconnect QuickBooks.";
    case "ACCESS_DENIED":
      return "QuickBooks denied this request. Reconnect QuickBooks and grant the required permissions.";
    case "INVALID_CONFIGURATION":
      return "This organization's QuickBooks connection is not configured correctly.";
    case "VALIDATION_ERROR":
      return "QuickBooks rejected this data as invalid.";
    case "RATE_LIMITED":
      return "QuickBooks is rate-limiting requests right now. Please try again shortly.";
    case "TEMPORARY_INTUIT_ERROR":
      return "QuickBooks is temporarily unavailable. Please try again shortly.";
    case "STALE_OBJECT":
      return "This record was changed in QuickBooks since it was last synced. Please retry.";
    case "INVALID_GRANT":
      return "This organization's QuickBooks connection is no longer valid. Please reconnect QuickBooks.";
    default:
      return "QuickBooks returned an unexpected error.";
  }
}
