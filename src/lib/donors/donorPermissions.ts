/**
 * Donor action permissions, scoped to the roles that actually exist in this
 * app's session model — wgc_admin/church_admin. In visible UI, church_admin
 * is always labeled "Organization Admin" (see donorLabels.ts) — this file
 * keeps the backend role string for compatibility with the session model,
 * per the standing instruction not to rename it.
 */
export type SessionRole = "wgc_super_admin" | "wgc_admin" | "church_admin";

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

export function getDonorPermissions(role: SessionRole | null | undefined): DonorPermissions {
  if (role === "wgc_admin" || role === "wgc_super_admin") {
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
  if (role === "church_admin") {
    return {
      canView: true,
      canExport: true,
      canAddNote: true,
      canEdit: true,
      canArchive: true,
      canRestore: true,
      canMerge: true,
      canGenerateStatements: true,
      canSendStatements: true,
      canTriggerSync: false,
    };
  }
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
