import type { MerchantAuthContext } from "./requireMerchantSession";
import { ForbiddenError } from "./errors";

/**
 * Confirms the authenticated user belongs to the same church as the
 * resource being accessed. This is the primary defense against
 * cross-organization access (IDOR) — every route that loads a resource by
 * ID (giving link, payment, donor, subscription, etc.) must call this with
 * that resource's churchId before returning it. The /merchant and
 * /api/merchant middleware is only a coarse backstop; it cannot know a
 * resource's churchId, so this per-route check is the real gate.
 */
export function requireOrganizationAccess(auth: MerchantAuthContext, resourceChurchId: string | null | undefined): void {
  if (!resourceChurchId || resourceChurchId !== auth.churchId) {
    throw new ForbiddenError("This resource does not belong to your organization.");
  }
}

export { requireFullOrganizationContext } from "./viewScope";
