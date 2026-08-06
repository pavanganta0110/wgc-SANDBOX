/** Thrown by requireMerchantSession() when there is no valid, current session. */
export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor(message = "Authentication required.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/** Thrown by requireOrganizationAccess/requirePermission/requireFullOrganizationContext
 * when the session is valid but the action isn't allowed. */
export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message = "You do not have permission to perform this action.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Thrown by requireMerchantSession() when the session is valid but the
 * organization's WGC platform-billing access state restricts dashboard
 * access (billing setup incomplete, past-due beyond grace, canceled,
 * suspended) — see src/lib/billing/accessGate.ts. Carries the resolved
 * state so callers/UI can show a specific message. */
export class BillingAccessRestrictedError extends Error {
  readonly status = 403;
  readonly accessState: string;
  constructor(accessState: string, message: string) {
    super(message);
    this.name = "BillingAccessRestrictedError";
    this.accessState = accessState;
  }
}

/** True for any error these helpers throw — lets route handlers do a single
 * `catch (e) { if (isAuthError(e)) return NextResponse.json({ error: e.message }, { status: e.status }); throw e; }`
 *
 * Deliberately does NOT include BillingAccessRestrictedError: dozens of
 * existing page.tsx files do `if (isAuthError(err)) redirect("/merchant/login")`
 * — an already-logged-in user hitting the billing gate must never be sent
 * to the login page (that would either confuse them or, after re-login,
 * loop straight back into the same gate on the next page). Page-level
 * billing-gate handling is instead centralized in
 * src/app/merchant/(dashboard)/error.tsx (a segment error boundary), and
 * API routes that want a clean 403 for it should check isBillingAccessError
 * explicitly (see the new billing routes for the pattern) rather than
 * folding it into the generic auth check every other route already uses. */
export function isAuthError(err: unknown): err is UnauthorizedError | ForbiddenError {
  return err instanceof UnauthorizedError || err instanceof ForbiddenError;
}

export function isBillingAccessError(err: unknown): err is BillingAccessRestrictedError {
  return err instanceof BillingAccessRestrictedError;
}
