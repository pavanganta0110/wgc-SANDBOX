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

/** True for any error these helpers throw — lets route handlers do a single
 * `catch (e) { if (isAuthError(e)) return NextResponse.json({ error: e.message }, { status: e.status }); throw e; }` */
export function isAuthError(err: unknown): err is UnauthorizedError | ForbiddenError {
  return err instanceof UnauthorizedError || err instanceof ForbiddenError;
}
