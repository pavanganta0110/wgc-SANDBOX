import { normalizeMerchantRole, ROLE_PERMISSIONS } from "@/lib/auth/roles";

export type SessionRole = "wgc_admin" | "church_admin" | "owner" | "admin" | "fundraiser" | "viewer";

export interface SettlementPermissions {
  canView: boolean;
  canExport: boolean;
  canConfirmDepositLink: boolean;
  canManageReconciliation: boolean;
  canTriggerSync: boolean;
}

/**
 * Team-access Checkpoint 4: composed from the centralized role-permission
 * matrix, directly per the approved policy — "OWNER: allowed. ADMIN:
 * allowed according to canViewSettlements. FUNDRAISER: denied. VIEWER:
 * denied unless explicitly overridden." Deposit-link confirmation and
 * reconciliation management stay wgc_admin-only, matching this module's
 * original, still-correct design intent (no organization-side role gets
 * these — they're WGC-operational actions, not merchant self-service ones).
 */
export function getSettlementPermissions(role: SessionRole | null | undefined): SettlementPermissions {
  if (role === "wgc_admin") {
    return {
      canView: true,
      canExport: true,
      canConfirmDepositLink: true,
      canManageReconciliation: true,
      canTriggerSync: true,
    };
  }

  const normalized = normalizeMerchantRole(role);
  if (!normalized) {
    return {
      canView: false,
      canExport: false,
      canConfirmDepositLink: false,
      canManageReconciliation: false,
      canTriggerSync: false,
    };
  }

  const base = ROLE_PERMISSIONS[normalized];
  return {
    canView: base.canViewSettlements,
    canExport: base.canViewSettlements && base.canExportReports,
    canConfirmDepositLink: false,
    canManageReconciliation: false,
    canTriggerSync: false,
  };
}
