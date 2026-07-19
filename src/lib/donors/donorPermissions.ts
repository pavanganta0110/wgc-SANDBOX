import { normalizeMerchantRole, ROLE_PERMISSIONS } from "@/lib/auth/roles";

export type SessionRole = "wgc_admin" | "church_admin" | "owner" | "admin" | "fundraiser" | "viewer";

export interface DonorPermissions {
  canView: boolean;
  canExport: boolean;
  canAddNote: boolean;
  canEdit: boolean;
  canArchive: boolean;
  canRestore: boolean;
  canMerge: boolean;
  canGenerateStatements: boolean;
  canSendStatements: boolean;
  canTriggerSync: boolean;
}

/** Team-access Checkpoint 4: composed from the centralized role-permission
 * matrix — see organizationPermissions.ts's comment for the wgc_admin branch
 * rationale. Donor mutations (add note/edit/archive/restore/merge/statements)
 * don't have a dedicated centralized permission key, so they compose from
 * canManageOrgSettings (owner/admin only) — FUNDRAISER's donor access is
 * view-only (see canViewDonors + the scoping rules in scopes.ts, which limit
 * *which* donors a fundraiser sees to ones with an attributed payment/
 * subscription; this file governs what they can *do* with a donor they can see). */
export function getDonorPermissions(role: SessionRole | null | undefined): DonorPermissions {
  if (role === "wgc_admin") {
    return {
      canView: true,
      canExport: true,
      canAddNote: true,
      canEdit: true,
      canArchive: true,
      canRestore: true,
      canMerge: true,
      canGenerateStatements: true,
      canSendStatements: false, // wgc_admin can troubleshoot but must not send on an organization's behalf without an authorized action
      canTriggerSync: true,
    };
  }

  const normalized = normalizeMerchantRole(role);
  if (!normalized) {
    return {
      canView: false,
      canExport: false,
      canAddNote: false,
      canEdit: false,
      canArchive: false,
      canRestore: false,
      canMerge: false,
      canGenerateStatements: false,
      canSendStatements: false,
      canTriggerSync: false,
    };
  }

  const base = ROLE_PERMISSIONS[normalized];
  return {
    canView: base.canViewDonors,
    canExport: base.canExportReports,
    canAddNote: base.canManageOrgSettings,
    canEdit: base.canManageOrgSettings,
    canArchive: base.canManageOrgSettings,
    canRestore: base.canManageOrgSettings,
    canMerge: base.canManageOrgSettings,
    canGenerateStatements: base.canManageOrgSettings,
    canSendStatements: base.canManageOrgSettings,
    canTriggerSync: false, // wgc_admin-only, handled above
  };
}
