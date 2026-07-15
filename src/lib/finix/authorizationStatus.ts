export type AuthorizationEffectiveStatus =
  | "CAPTURED"
  | "VOIDED"
  | "EXPIRED"
  | "SUCCEEDED"
  | "PENDING"
  | "FAILED"
  | "UNKNOWN";

export interface AuthorizationLike {
  finixTransferId?: string | null;
  isVoid?: boolean | null;
  expiresAt?: Date | null;
  state?: string | null;
}

export function isAuthorizationCaptured(auth: AuthorizationLike): boolean {
  return Boolean(auth.finixTransferId);
}

/**
 * Effective status precedence: a captured authorization became a real
 * transfer, so that outranks everything else. Otherwise, a voided hold
 * (card hold released, never charged) outranks the raw processor state —
 * without this, a voided authorization would misleadingly still show
 * SUCCEEDED. Expired only applies to holds that were never captured or
 * voided and simply timed out. Anything else falls back to Finix's raw
 * state (SUCCEEDED / PENDING / FAILED).
 */
export function resolveAuthorizationEffectiveStatus(
  auth: AuthorizationLike
): AuthorizationEffectiveStatus {
  if (isAuthorizationCaptured(auth)) return "CAPTURED";
  if (auth.isVoid) return "VOIDED";
  if (auth.expiresAt && auth.expiresAt.getTime() < Date.now()) return "EXPIRED";
  const state = (auth.state || "").toUpperCase();
  if (state === "SUCCEEDED" || state === "PENDING" || state === "FAILED") {
    return state as AuthorizationEffectiveStatus;
  }
  return "UNKNOWN";
}
