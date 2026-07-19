import { normalizeMerchantRole, ROLE_PERMISSIONS } from "@/lib/auth/roles";

export type SessionRole = "wgc_admin" | "church_admin" | "owner" | "admin" | "fundraiser" | "viewer";

export interface OrganizationPermissions {
  canView: boolean;
  canEditProfile: boolean; // non-restricted fields only (public display name, website, phone, contact emails, mailing address, logo, timezone, language)
  canRequestRestrictedChange: boolean; // legal name, tax ID, legal address, ownership, authorized signer, org type affecting underwriting
  canUpdateBankAccount: boolean;
  canManageContacts: boolean;
  canUploadDocuments: boolean;
  canExport: boolean;
}

/**
 * Team-access Checkpoint 4: composed from the centralized role-permission
 * matrix (src/lib/auth/roles.ts) rather than a second, independent
 * wgc_admin/church_admin-only definition. wgc_admin keeps its own explicit
 * branch here — this module is still reachable from getSession()-based
 * internal WGC review flows that requireMerchantSession() intentionally
 * excludes (see that function's Checkpoint 2 correction), so wgc_admin's
 * view-only support access needs to remain real, not just "not yet wired."
 */
export function getOrganizationPermissions(role: SessionRole | null | undefined): OrganizationPermissions {
  if (role === "wgc_admin") {
    return {
      canView: true,
      canEditProfile: false,
      canRequestRestrictedChange: false,
      canUpdateBankAccount: false,
      canManageContacts: false,
      canUploadDocuments: false,
      canExport: false,
    };
  }

  const normalized = normalizeMerchantRole(role);
  if (!normalized) {
    return {
      canView: false,
      canEditProfile: false,
      canRequestRestrictedChange: false,
      canUpdateBankAccount: false,
      canManageContacts: false,
      canUploadDocuments: false,
      canExport: false,
    };
  }

  const base = ROLE_PERMISSIONS[normalized];
  return {
    canView: true,
    canEditProfile: base.canManageOrgSettings,
    canRequestRestrictedChange: base.canManageOrgSettings,
    canUpdateBankAccount: base.canManageBankAccount,
    canManageContacts: base.canManageOrgSettings,
    canUploadDocuments: base.canManageOrgSettings,
    canExport: base.canExportReports,
  };
}
