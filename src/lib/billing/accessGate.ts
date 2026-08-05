import { prisma } from "@/lib/prisma";

/**
 * Centralized organization access-state resolution for the WGC
 * platform-subscription billing gate. Consulted from
 * requireMerchantSession() itself (see requireMerchantSession.ts), which
 * every merchant page, server action, and API route already calls — so
 * this enforces server-side for the entire dashboard/API surface without
 * requiring every individual route to be retrofitted one at a time, and
 * without relying on Edge middleware (which cannot safely resolve
 * Prisma/organization state).
 *
 * FINIX_UNDER_REVIEW is intentionally not a reachable state here: Church
 * (and therefore any merchant User row with a churchId) is only ever
 * created by provisionChurchAccount() AFTER Finix approval — there is no
 * login capability before that point, so no session can ever exist in an
 * "under review" org. That state is enforced structurally by the
 * onboarding flow itself, not by this gate.
 */

export type OrgAccessState =
  /** No billingSetupStatus set at all — an organization that existed
   * before this feature shipped. Never gated, by design (no retroactive
   * restriction of grandfathered accounts). */
  | "NO_GATE"
  | "APPROVED_BILLING_REQUIRED"
  | "TRIALING_OR_ACTIVE"
  | "PAST_DUE_IN_GRACE"
  | "PAST_DUE_EXPIRED"
  | "CANCELED"
  | "SUSPENDED";

export interface OrgAccessResult {
  state: OrgAccessState;
  /** true = normal dashboard features are allowed; false = only the
   * restricted allowlist (billing setup, billing management, support,
   * logout, minimal account info). */
  fullAccessAllowed: boolean;
  gracePeriodEndsAt: Date | null;
}

export async function resolveOrgAccessState(churchId: string): Promise<OrgAccessResult> {
  const [church, subscription] = await Promise.all([
    prisma.church.findUnique({ where: { id: churchId }, select: { billingSetupStatus: true, status: true } }),
    prisma.wgcSubscription.findUnique({ where: { organizationId: churchId } }),
  ]);

  if (!church) {
    // Should not happen for a real session (requireMerchantSession already
    // requires a valid churchId), but never restrict on a lookup miss —
    // fail open here specifically, since the real security boundary is the
    // session/churchId check itself, not this gate.
    return { state: "NO_GATE", fullAccessAllowed: true, gracePeriodEndsAt: null };
  }

  if (church.status === "SUSPENDED") {
    return { state: "SUSPENDED", fullAccessAllowed: false, gracePeriodEndsAt: null };
  }

  if (!church.billingSetupStatus) {
    // Grandfathered — existed before this feature; never gated.
    return { state: "NO_GATE", fullAccessAllowed: true, gracePeriodEndsAt: null };
  }

  if (church.billingSetupStatus === "APPROVED_BILLING_REQUIRED" && !subscription?.finixSubscriptionId) {
    return { state: "APPROVED_BILLING_REQUIRED", fullAccessAllowed: false, gracePeriodEndsAt: null };
  }

  if (subscription?.status === "CANCELED") {
    return { state: "CANCELED", fullAccessAllowed: false, gracePeriodEndsAt: null };
  }

  if (subscription?.status === "PAST_DUE") {
    const inGrace = subscription.gracePeriodEndsAt ? subscription.gracePeriodEndsAt > new Date() : true;
    return {
      state: inGrace ? "PAST_DUE_IN_GRACE" : "PAST_DUE_EXPIRED",
      // Configurable via WGC_BILLING_RESTRICT_PAST_DUE_IN_GRACE — default
      // policy is to keep full access during the grace period itself
      // (only the expired-grace-period state restricts features), per
      // "Allow access according to the configured grace-period policy."
      fullAccessAllowed: inGrace,
      gracePeriodEndsAt: subscription.gracePeriodEndsAt,
    };
  }

  // TRIALING, ACTIVE, or a subscription row that exists but hasn't hit any
  // of the above conditions — normal access.
  return { state: "TRIALING_OR_ACTIVE", fullAccessAllowed: true, gracePeriodEndsAt: null };
}
