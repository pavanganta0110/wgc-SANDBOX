import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE_NAME } from "./sessionConstants";
import { verifySessionToken } from "./session";
import { normalizeMerchantRole, type NormalizedOrgRole, type RawUserRole } from "./roles";
import { UnauthorizedError, BillingAccessRestrictedError } from "./errors";
import { resolveOrgAccessState, type OrgAccessState } from "@/lib/billing/accessGate";

export interface MerchantAuthContext {
  userId: string;
  email: string;
  churchId: string;
  rawRole: RawUserRole;
  /** Normalized org role, or null for wgc_admin / an unrecognized role string. */
  role: NormalizedOrgRole | null;
  isWgcAdmin: boolean;
  permissionsJson: unknown;
  authVersion: number;
  authTime: number | null;
  /** The resolved WGC platform-billing access state — present even when
   * fullAccessAllowed is true, so callers that DO allow restricted access
   * (via allowRestrictedAccess=true) can still show an accurate banner.
   * Optional (rather than required) purely so the many existing tests that
   * construct a MerchantAuthContext literal for permission-matrix testing
   * don't all need updating — treat a missing value as "no gate." */
  orgAccessState?: OrgAccessState;
}

const ACCESS_STATE_MESSAGES: Record<OrgAccessState, string> = {
  NO_GATE: "",
  TRIALING_OR_ACTIVE: "",
  APPROVED_BILLING_REQUIRED:
    "Finish setting up your WGC Platform subscription billing to unlock full dashboard access.",
  PAST_DUE_IN_GRACE: "",
  PAST_DUE_EXPIRED:
    "Your WGC subscription payment is past due and the grace period has ended. Update your billing method to restore full access.",
  CANCELED: "Your WGC Platform subscription has been canceled. Reactivate to restore full dashboard access.",
  SUSPENDED: "This organization's account has been suspended. Contact WGC Payments support for assistance.",
};

/**
 * The single centralized entry point for "is there a valid, current
 * merchant session, and who is it." Wrapped in React's cache() so it only
 * hits the database once per request no matter how many of the helpers in
 * this directory call it — see the Checkpoint 2 SESSION PERFORMANCE
 * requirement. Do not call prisma.user.findUnique for auth purposes outside
 * this function; call requireMerchantSession() instead so the memoization
 * actually applies.
 *
 * Deliberately does its own single-query DB check rather than delegating to
 * getSession() (which does a lighter, separate DB round trip) — routes not
 * yet retrofitted to this helper keep using getSession() directly, but any
 * route calling requireMerchantSession() gets exactly one query for the
 * full auth context (role, permissionsJson, disabled/authVersion checks all
 * included).
 *
 * Throws UnauthorizedError (never returns null) — callers should let it
 * propagate to a top-level catch that maps AuthError -> 401/403 response,
 * or catch it directly where a custom message is needed.
 *
 * WGC platform-billing access gate: by default (allowRestrictedAccess
 * false/omitted — every existing call site, unchanged), also throws
 * BillingAccessRestrictedError when the organization's billing/subscription
 * state restricts dashboard access (billing setup incomplete, past-due
 * beyond grace, canceled, suspended) — see accessGate.ts. This is what
 * makes the gate centrally enforced across every page/API/server action
 * that already calls this function, without retrofitting each one.
 *
 * The small allowlist of routes that must remain reachable in a restricted
 * state (billing setup/management, support, logout, minimal account info)
 * pass allowRestrictedAccess=true explicitly and are individually
 * responsible for only exposing the narrow allowed functionality — this
 * function still resolves and returns orgAccessState so they can react to
 * it (e.g. show a banner, or further restrict what they render).
 */
export const requireMerchantSession = cache(async (allowRestrictedAccess: boolean = false): Promise<MerchantAuthContext> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) throw new UnauthorizedError("No session cookie present.");

  const payload = verifySessionToken(token);
  if (!payload) throw new UnauthorizedError("Session is invalid or expired.");

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      email: true,
      churchId: true,
      role: true,
      disabledAt: true,
      authVersion: true,
      permissionsJson: true,
    },
  });

  if (!user) throw new UnauthorizedError("User no longer exists.");
  if (user.disabledAt) throw new UnauthorizedError("This account has been disabled.");

  const rawRole = user.role as RawUserRole;

  // Checkpoint 2 correction: wgc_admin/wgc_super_admin are WGC's own
  // internal roles, not a merchant organization role. There is currently
  // no support-access flow (selected churchId + acting admin + reason +
  // expiration + audit record + read-only default) — until that exists,
  // requireMerchantSession() must not admit either into merchant/
  // organization routes at all, even read-only ones. This is deliberate
  // and explicit rather than an incidental side effect of the churchId
  // check below: either role could theoretically end up with a non-null
  // churchId (e.g. a future provisioning bug) and must still be rejected
  // here regardless. wgc_super_admin is live's higher-privilege internal
  // admin-panel role (manages wgc_admin accounts) — same shared User.role
  // column, same rejection.
  if (rawRole === "wgc_admin" || rawRole === "wgc_super_admin") {
    throw new UnauthorizedError(
      "WGC internal accounts cannot access merchant organization data through this session. Use the WGC support-access flow instead."
    );
  }

  if (!user.churchId) throw new UnauthorizedError("User has no associated organization.");
  if ((payload.authVersion ?? 0) !== user.authVersion) {
    throw new UnauthorizedError("Session is stale — please log in again.");
  }

  const access = await resolveOrgAccessState(user.churchId);
  if (!access.fullAccessAllowed && !allowRestrictedAccess) {
    throw new BillingAccessRestrictedError(access.state, ACCESS_STATE_MESSAGES[access.state] || "Dashboard access is currently restricted.");
  }

  return {
    userId: user.id,
    email: user.email,
    churchId: user.churchId,
    rawRole,
    role: normalizeMerchantRole(rawRole),
    // Always false here — wgc_admin never reaches this return (see the throw
    // above; TS narrows rawRole to exclude "wgc_admin" past that point).
    // Field kept on the type for the future WGC support-access flow, which
    // will need its own separate entry point (not this function) with its
    // own churchId-selection/reason/expiration requirements.
    isWgcAdmin: false,
    permissionsJson: user.permissionsJson,
    authVersion: user.authVersion,
    authTime: payload.authTime ?? null,
    orgAccessState: access.state,
  };
});
