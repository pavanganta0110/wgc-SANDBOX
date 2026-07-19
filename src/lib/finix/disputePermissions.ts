import { normalizeMerchantRole, ROLE_PERMISSIONS } from "@/lib/auth/roles";

export type SessionRole = "wgc_admin" | "church_admin" | "owner" | "admin" | "fundraiser" | "viewer";

export interface DisputePermissions {
  canView: boolean;
  canUpload: boolean;
  canDelete: boolean;
  canSubmit: boolean;
  canExport: boolean;
}

/**
 * Team-access Checkpoint 4A correction: dispute reads have no row-level
 * attribution wired yet (that would mean scoping dispute list/detail/notes
 * through their related payment's attribution field — not implemented this
 * checkpoint). Per the approved fallback policy ("if safe row-level scoping
 * cannot be implemented immediately, deny FUNDRAISER and VIEWER entirely —
 * this is a data-exposure issue, not low-severity"), canView is now
 * owner/admin-only via canManageOrgSettings, not the previous
 * canViewAllTransactions/canViewOwnTransactions composition (which
 * incorrectly let FUNDRAISER/VIEWER see every dispute in the church).
 * Revisit once dispute reads are actually scoped through their payment.
 */
export function getDisputePermissions(role: SessionRole | null | undefined): DisputePermissions {
  if (role === "wgc_admin") {
    return { canView: true, canUpload: true, canDelete: true, canSubmit: true, canExport: true };
  }

  const normalized = normalizeMerchantRole(role);
  if (!normalized) {
    return { canView: false, canUpload: false, canDelete: false, canSubmit: false, canExport: false };
  }

  const base = ROLE_PERMISSIONS[normalized];
  return {
    canView: base.canManageOrgSettings,
    canUpload: base.canManageOrgSettings,
    canDelete: base.canManageOrgSettings,
    canSubmit: base.canManageOrgSettings,
    canExport: base.canExportReports,
  };
}
