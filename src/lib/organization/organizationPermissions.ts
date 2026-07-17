/** Mirrors src/lib/donors/donorPermissions.ts — same two real roles, church_admin always labeled "Organization Admin" in UI. */
export type SessionRole = "wgc_super_admin" | "wgc_admin" | "church_admin";

export interface OrganizationPermissions {
  canView: boolean;
  canEditProfile: boolean; // non-restricted fields only (public display name, website, phone, contact emails, mailing address, logo, timezone, language)
  canRequestRestrictedChange: boolean; // legal name, tax ID, legal address, ownership, authorized signer, org type affecting underwriting
  canUpdateBankAccount: boolean;
  canManageContacts: boolean;
  canUploadDocuments: boolean;
  canExport: boolean;
}

export function getOrganizationPermissions(role: SessionRole | null | undefined): OrganizationPermissions {
  if (role === "wgc_admin" || role === "wgc_super_admin") {
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
  if (role === "church_admin") {
    return {
      canView: true,
      canEditProfile: true,
      canRequestRestrictedChange: true,
      canUpdateBankAccount: true,
      canManageContacts: true,
      canUploadDocuments: true,
      canExport: true,
    };
  }
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
