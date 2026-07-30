/**
 * Normalized error categories for the Aplos integration, per the approved
 * spec's exact list. Every layer (auth provider, future API client, retry
 * service) classifies into one of these rather than passing a raw Aplos
 * exception or HTTP status up to the merchant UI or a retry decision.
 *
 * The mapping table below is built directly from Aplos's confirmed,
 * complete exception-code catalog (help.aplos.com "API: Error Handling",
 * fetched during Checkpoint 2) — every code in that catalog is mapped here;
 * nothing is invented. Codes Aplos has not documented map to UNKNOWN_ERROR,
 * never silently to a specific category.
 */

export type AplosErrorCategory =
  | "AUTHENTICATION_REQUIRED"
  | "ACCESS_DENIED"
  | "INVALID_CONFIGURATION"
  | "MAPPING_REQUIRED"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "TEMPORARY_APLOS_ERROR"
  | "RECONCILIATION_ERROR"
  | "AMBIGUOUS_RESULT"
  | "UNKNOWN_ERROR";

export interface NormalizedAplosError {
  category: AplosErrorCategory;
  /** Merchant-safe message — never includes a raw Aplos exception message,
   * stack trace, or any response body content verbatim, per the "must not
   * reveal sensitive details" requirement. */
  safeMessage: string;
  /** True if this category is ever eligible for automatic retry (per the
   * approved retry policy) — actual scheduling lives in retry.ts (a later
   * checkpoint); this only classifies. */
  retryable: boolean;
  /** The original Aplos exception code, when known — kept for
   * AplosSyncAttempt.safeErrorCode / operator diagnosis, never shown
   * verbatim to the merchant as the primary message. */
  aplosExceptionCode?: number;
}

/**
 * Direct mapping from Aplos's documented exception codes (help.aplos.com
 * "API: Error Handling") to our normalized categories. Every code Aplos
 * documents as of this fetch is present.
 */
const APLOS_EXCEPTION_CODE_MAP: Record<number, { category: AplosErrorCategory; retryable: boolean }> = {
  // Authorization: 1000-1999
  1001: { category: "ACCESS_DENIED", retryable: false }, // Client Disabled
  1002: { category: "AUTHENTICATION_REQUIRED", retryable: true }, // Missing Token
  1003: { category: "ACCESS_DENIED", retryable: false }, // Revoked Token
  1004: { category: "AUTHENTICATION_REQUIRED", retryable: true }, // Expired Token — refresh and retry once
  1005: { category: "INVALID_CONFIGURATION", retryable: false }, // Client Invalid
  1006: { category: "ACCESS_DENIED", retryable: false }, // Client Unauthorized (also used by /partners/verify)

  // Access: 3000-3999
  3000: { category: "ACCESS_DENIED", retryable: false },
  3001: { category: "INVALID_CONFIGURATION", retryable: false }, // Not Available (e.g. POST to a read-only resource)
  3002: { category: "VALIDATION_ERROR", retryable: false }, // Missing Input

  // Data: 4000-4999
  4000: { category: "VALIDATION_ERROR", retryable: false }, // Invalid Data (malformed/missing JSON)
  4001: { category: "VALIDATION_ERROR", retryable: false }, // Required Data missing
  4002: { category: "VALIDATION_ERROR", retryable: false }, // Invalid Data Format
  4003: { category: "VALIDATION_ERROR", retryable: false }, // Invalid Data Length Minimum
  4004: { category: "VALIDATION_ERROR", retryable: false }, // Invalid Data Length Maximum
  4005: { category: "RECONCILIATION_ERROR", retryable: false }, // Lines Out of Balance
  4006: { category: "RECONCILIATION_ERROR", retryable: false }, // Lines Do Not Sum
  4007: { category: "VALIDATION_ERROR", retryable: false }, // Invalid Account Type
  4008: { category: "INVALID_CONFIGURATION", retryable: false }, // Date is in a closed period

  // Service
  5000: { category: "TEMPORARY_APLOS_ERROR", retryable: true },
};

export function classifyAplosExceptionCode(code: number, httpStatus?: number): NormalizedAplosError {
  const mapped = APLOS_EXCEPTION_CODE_MAP[code];
  if (mapped) {
    return {
      category: mapped.category,
      retryable: mapped.retryable,
      aplosExceptionCode: code,
      safeMessage: describeCategory(mapped.category),
    };
  }

  // Aplos's docs do not publish a rate-limit HTTP status/exception code —
  // confirmed absent, not overlooked (see docs/integrations/aplos.md "Open
  // Items"). A 429 is the de facto HTTP convention for rate limiting, so an
  // unrecognized exception code paired with a 429 is treated as RATE_LIMITED
  // defensively; this is inference, not a documented Aplos behavior, and is
  // flagged as such rather than presented as confirmed.
  if (httpStatus === 429) {
    return { category: "RATE_LIMITED", retryable: true, aplosExceptionCode: code, safeMessage: describeCategory("RATE_LIMITED") };
  }

  return { category: "UNKNOWN_ERROR", retryable: false, aplosExceptionCode: code, safeMessage: describeCategory("UNKNOWN_ERROR") };
}

/** For failures that never reached Aplos at all (network error, our own
 * timeout, JSON parse failure) — no exception code exists to classify. */
export function classifyNetworkOrTimeoutError(kind: "TIMEOUT" | "NETWORK_ERROR" | "MALFORMED_RESPONSE"): NormalizedAplosError {
  if (kind === "TIMEOUT") {
    // A timeout on a write (e.g. contribution POST) is not safely retryable
    // without first verifying whether Aplos actually processed it — that
    // verify-before-retry decision belongs to idempotency.ts /
    // AplosSettlementSyncService, not this classifier. Callers on a mutating
    // request must treat this as AMBIGUOUS_RESULT, not TEMPORARY_APLOS_ERROR;
    // this generic classifier defaults to the safer (non-retryable) reading.
    return { category: "AMBIGUOUS_RESULT", retryable: false, safeMessage: describeCategory("AMBIGUOUS_RESULT") };
  }
  if (kind === "NETWORK_ERROR") {
    return { category: "TEMPORARY_APLOS_ERROR", retryable: true, safeMessage: describeCategory("TEMPORARY_APLOS_ERROR") };
  }
  return { category: "UNKNOWN_ERROR", retryable: false, safeMessage: describeCategory("UNKNOWN_ERROR") };
}

function describeCategory(category: AplosErrorCategory): string {
  switch (category) {
    case "AUTHENTICATION_REQUIRED":
      return "Aplos authentication is required or has expired. This should resolve automatically on the next sync attempt.";
    case "ACCESS_DENIED":
      return "Aplos denied access with the connected credentials. Reconnect your Aplos account to continue.";
    case "INVALID_CONFIGURATION":
      return "The Aplos configuration for this organization is invalid or incomplete. Check your account, deposit, and expense account settings.";
    case "MAPPING_REQUIRED":
      return "One or more funds are not mapped to an Aplos purpose. Complete fund mapping to continue.";
    case "VALIDATION_ERROR":
      return "Aplos rejected the submitted data as invalid.";
    case "RATE_LIMITED":
      return "Aplos is temporarily limiting requests. This will be retried automatically.";
    case "TEMPORARY_APLOS_ERROR":
      return "Aplos experienced a temporary error. This will be retried automatically.";
    case "RECONCILIATION_ERROR":
      return "The settlement totals do not balance and were not sent to Aplos.";
    case "AMBIGUOUS_RESULT":
      return "The result of the last attempt could not be confirmed. This requires manual review before retrying.";
    case "UNKNOWN_ERROR":
    default:
      return "An unexpected error occurred communicating with Aplos.";
  }
}
