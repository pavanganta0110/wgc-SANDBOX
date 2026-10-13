/**
 * Normalized error categories for the Planning Center integration, same
 * shape as quickbooks/errors.ts. Planning Center uses plain HTTP statuses
 * (JSON:API `errors` array) and standard OAuth2 errors on the token
 * endpoint.
 */

export type PlanningCenterErrorCategory =
  | "AUTHENTICATION_REQUIRED"
  | "ACCESS_DENIED"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "TEMPORARY_PLANNING_CENTER_ERROR"
  | "INVALID_GRANT"
  | "UNKNOWN_ERROR";

export interface NormalizedPlanningCenterError {
  category: PlanningCenterErrorCategory;
  /** Merchant-safe message — never the raw Planning Center detail. */
  safeMessage: string;
  retryable: boolean;
  /** Internal-diagnosis only, never shown as the primary message. */
  rawDetail?: string;
  /** Seconds from a 429's Retry-After header, when present. */
  retryAfterSeconds?: number;
}

export class PlanningCenterConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanningCenterConfigError";
  }
}

export class PlanningCenterConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanningCenterConnectionError";
  }
}

export class PlanningCenterAuthError extends Error {
  readonly normalized: NormalizedPlanningCenterError;
  constructor(normalized: NormalizedPlanningCenterError, message?: string) {
    super(message ?? normalized.safeMessage);
    this.name = "PlanningCenterAuthError";
    this.normalized = normalized;
  }
}

export class PlanningCenterApiError extends Error {
  status: number;
  normalized: NormalizedPlanningCenterError;
  constructor(normalized: NormalizedPlanningCenterError, status: number) {
    super(normalized.safeMessage);
    this.name = "PlanningCenterApiError";
    this.status = status;
    this.normalized = normalized;
  }
}

export function classifyHttpStatus(status: number): NormalizedPlanningCenterError {
  if (status === 401) return { category: "AUTHENTICATION_REQUIRED", retryable: false, safeMessage: safeMessage("AUTHENTICATION_REQUIRED") };
  if (status === 403) return { category: "ACCESS_DENIED", retryable: false, safeMessage: safeMessage("ACCESS_DENIED") };
  if (status === 429) return { category: "RATE_LIMITED", retryable: true, safeMessage: safeMessage("RATE_LIMITED") };
  if (status >= 500) return { category: "TEMPORARY_PLANNING_CENTER_ERROR", retryable: true, safeMessage: safeMessage("TEMPORARY_PLANNING_CENTER_ERROR") };
  if (status === 400 || status === 404 || status === 422) return { category: "VALIDATION_ERROR", retryable: false, safeMessage: safeMessage("VALIDATION_ERROR") };
  return { category: "UNKNOWN_ERROR", retryable: false, safeMessage: safeMessage("UNKNOWN_ERROR") };
}

/**
 * The OAuth token endpoint returns standard OAuth2 errors ({ error,
 * error_description }). `invalid_grant` means the refresh token is dead
 * (expired, revoked, or already used) and the church must reconnect; it is
 * never worth retrying.
 */
export function classifyTokenEndpointError(status: number, body: unknown): NormalizedPlanningCenterError {
  const errorBody = body && typeof body === "object" ? (body as { error?: unknown; error_description?: unknown }) : undefined;
  const rawDetail = typeof errorBody?.error_description === "string" ? errorBody.error_description : undefined;
  if (errorBody?.error === "invalid_grant") {
    return { category: "INVALID_GRANT", retryable: false, safeMessage: safeMessage("INVALID_GRANT"), rawDetail };
  }
  return { ...classifyHttpStatus(status), rawDetail };
}

export function classifyNetworkOrTimeoutError(): NormalizedPlanningCenterError {
  return { category: "TEMPORARY_PLANNING_CENTER_ERROR", retryable: true, safeMessage: "Could not reach Planning Center. Please try again in a moment." };
}

function safeMessage(category: PlanningCenterErrorCategory): string {
  switch (category) {
    case "AUTHENTICATION_REQUIRED":
      return "This organization's Planning Center connection has expired. Please reconnect Planning Center.";
    case "ACCESS_DENIED":
      return "Planning Center denied this request. The connected user may not have access to this area of Planning Center.";
    case "VALIDATION_ERROR":
      return "Planning Center rejected this request.";
    case "RATE_LIMITED":
      return "Planning Center is rate-limiting requests right now. Please try again shortly.";
    case "TEMPORARY_PLANNING_CENTER_ERROR":
      return "Planning Center is temporarily unavailable. Please try again shortly.";
    case "INVALID_GRANT":
      return "This organization's Planning Center connection is no longer valid. Please reconnect Planning Center.";
    default:
      return "Planning Center returned an unexpected error.";
  }
}
