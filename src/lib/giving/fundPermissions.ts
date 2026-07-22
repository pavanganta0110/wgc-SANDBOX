import { hasPermission } from "@/lib/auth/permissions";
import type { MerchantAuthContext } from "@/lib/auth/requireMerchantSession";

/**
 * The Fund catalog (Gift Designations) is a church-wide resource shared
 * across every giving link, not owned by one fundraiser — managing it
 * (create/edit/archive/reorder) is gated the same as other organization-
 * wide settings, not per-giving-link ownership. Assigning funds to a
 * specific giving link is part of editing that link itself, gated by
 * whatever permission already governs editing that link — no separate
 * check needed there.
 */
export function canManageFunds(auth: MerchantAuthContext): boolean {
  return hasPermission(auth, "canManageOrgSettings");
}
