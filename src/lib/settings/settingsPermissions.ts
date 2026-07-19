import { normalizeMerchantRole, ROLE_PERMISSIONS } from "@/lib/auth/roles";

export type SessionRole = "wgc_admin" | "church_admin" | "owner" | "admin" | "fundraiser" | "viewer";

export interface SettingsPermissions {
  canView: boolean;
  canEdit: boolean;
  canManageTeam: boolean;
  canManageSecurity: boolean;
  canManageBranding: boolean;
  canManageIntegrations: boolean;
  canTriggerSync: boolean; // wgc_admin-only: the actual "Sync Payments/Refunds/etc" backfill actions
  canViewAudit: boolean;
  canExportData: boolean;
  canRequestAccountClosure: boolean;
}

/** Team-access Checkpoint 4: composed from the centralized role-permission
 * matrix — see organizationPermissions.ts's comment for why wgc_admin keeps
 * its own explicit branch here rather than going through normalizeMerchantRole
 * (which deliberately maps wgc_admin to null). */
export function getSettingsPermissions(role: SessionRole | null | undefined): SettingsPermissions {
  if (role === "wgc_admin") {
    return {
      canView: true,
      canEdit: false, // wgc_admin can inspect but must not silently change organization-owned business settings
      canManageTeam: false,
      canManageSecurity: false,
      canManageBranding: false,
      canManageIntegrations: false,
      canTriggerSync: true,
      canViewAudit: true,
      canExportData: false,
      canRequestAccountClosure: false,
    };
  }

  const normalized = normalizeMerchantRole(role);
  if (!normalized) {
    return {
      canView: false,
      canEdit: false,
      canManageTeam: false,
      canManageSecurity: false,
      canManageBranding: false,
      canManageIntegrations: false,
      canTriggerSync: false,
      canViewAudit: false,
      canExportData: false,
      canRequestAccountClosure: false,
    };
  }

  const base = ROLE_PERMISSIONS[normalized];
  return {
    // Settings is an owner/admin-level surface — FUNDRAISER/VIEWER don't
    // see the Settings section at all (canManageOrgSettings is false for
    // both), matching the pre-existing UX where only admins had this page.
    canView: base.canManageOrgSettings,
    canEdit: base.canManageOrgSettings,
    canManageTeam: base.canManageTeam,
    canManageSecurity: base.canManageOrgSettings,
    canManageBranding: base.canManageOrgSettings,
    canManageIntegrations: base.canManageOrgSettings,
    canTriggerSync: false, // wgc_admin-only, handled above
    canViewAudit: base.canManageOrgSettings,
    canExportData: base.canExportReports,
    // Closing the account is existential/irreversible — OWNER-only,
    // deliberately not composed from canManageOrgSettings (which ADMIN also has).
    canRequestAccountClosure: normalized === "owner",
  };
}
