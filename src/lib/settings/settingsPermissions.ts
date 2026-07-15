/** Mirrors src/lib/donors/donorPermissions.ts — same two real roles, church_admin always labeled "Organization Admin" in UI. */
export type SessionRole = "wgc_admin" | "church_admin";

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
  if (role === "church_admin") {
    return {
      canView: true,
      canEdit: true,
      canManageTeam: true,
      canManageSecurity: true,
      canManageBranding: true,
      canManageIntegrations: true,
      canTriggerSync: false,
      canViewAudit: true,
      canExportData: true,
      canRequestAccountClosure: true,
    };
  }
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
