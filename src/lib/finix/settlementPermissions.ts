/**
 * Settlement action permissions, scoped to the roles that actually exist in
 * this app's session model today (wgc_admin/church_admin) — not the full
 * six-role model described in some specs, which the current task explicitly
 * excludes. church_admin can view and export their own church's data but
 * cannot confirm deposit links or reconciliation; only wgc_admin can.
 */
export type SessionRole = "wgc_super_admin" | "wgc_admin" | "church_admin";

export interface SettlementPermissions {
  canView: boolean;
  canExport: boolean;
  canConfirmDepositLink: boolean;
  canManageReconciliation: boolean;
  canTriggerSync: boolean;
}

export function getSettlementPermissions(role: SessionRole | null | undefined): SettlementPermissions {
  if (role === "wgc_admin" || role === "wgc_super_admin") {
    return {
      canView: true,
      canExport: true,
      canConfirmDepositLink: true,
      canManageReconciliation: true,
      canTriggerSync: true,
    };
  }
  if (role === "church_admin") {
    return {
      canView: true,
      canExport: true,
      canConfirmDepositLink: false,
      canManageReconciliation: false,
      canTriggerSync: false,
    };
  }
  return {
    canView: false,
    canExport: false,
    canConfirmDepositLink: false,
    canManageReconciliation: false,
    canTriggerSync: false,
  };
}
