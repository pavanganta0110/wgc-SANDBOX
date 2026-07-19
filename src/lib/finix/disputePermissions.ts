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
 * Team-access Checkpoint 4A correction (revisited): dispute reads are now
 * scoped through their related payment's attribution field — see
 * resolveScopedTransferIds in insightsData.ts, used by the disputes list/
 * detail pages and the evidence-download route to filter to only disputes
 * whose originating payment is attributed to the requester. With that
 * scoping in place, FUNDRAISER/VIEWER can see their own disputes
 * (canViewOwnTransactions) instead of being denied entirely; OWNER/ADMIN
 * keep unscoped organization-wide access (canManageOrgSettings). Upload/
 * delete/submit remain owner/admin-only — responding to a dispute is a
 * financial action, not a visibility question.
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
    canView: base.canManageOrgSettings || base.canViewOwnTransactions,
    canUpload: base.canManageOrgSettings,
    canDelete: base.canManageOrgSettings,
    canSubmit: base.canManageOrgSettings,
    canExport: base.canExportReports,
  };
}
