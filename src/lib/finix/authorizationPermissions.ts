import { normalizeMerchantRole, ROLE_PERMISSIONS } from "@/lib/auth/roles";

export type SessionRole = "wgc_admin" | "church_admin" | "owner" | "admin" | "fundraiser" | "viewer";

export interface AuthorizationPermissions {
  canView: boolean;
  canExport: boolean;
  canTriggerSync: boolean;
}

/**
 * Team-access Checkpoint 4C: FinixAuthorization carries no per-user
 * attribution of its own, and only captured authorizations (finixTransferId
 * set) can be bridged to a Payment's per-user owner — voided/expired ones
 * never can. Per the approved fallback policy for resources that can't be
 * reliably row-scoped: organization-wide only, gated the same way as
 * settlements/deposits (OWNER always, ADMIN per canViewSettlements,
 * FUNDRAISER/VIEWER denied entirely) rather than attempting partial
 * per-user slicing.
 */
export function getAuthorizationPermissions(role: SessionRole | null | undefined): AuthorizationPermissions {
  if (role === "wgc_admin") {
    return { canView: false, canExport: false, canTriggerSync: false };
  }

  const normalized = normalizeMerchantRole(role);
  if (!normalized) {
    return { canView: false, canExport: false, canTriggerSync: false };
  }

  const base = ROLE_PERMISSIONS[normalized];
  return {
    canView: base.canViewSettlements,
    canExport: base.canViewSettlements && base.canExportReports,
    canTriggerSync: base.canViewSettlements,
  };
}
