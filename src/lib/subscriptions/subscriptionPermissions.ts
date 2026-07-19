import { normalizeMerchantRole, ROLE_PERMISSIONS } from "@/lib/auth/roles";

export type SessionRole = "wgc_admin" | "church_admin" | "owner" | "admin" | "fundraiser" | "viewer";

export interface SubscriptionPermissions {
  canView: boolean;
  canExport: boolean;
  canCreate: boolean;
  canCancel: boolean;
  canUpdateAmount: boolean;
  canUpdateFrequency: boolean;
  canSendPaymentUpdateLink: boolean;
  canTriggerSync: boolean;
  canReconcileUnattributed: boolean;
}

/**
 * Team-access Checkpoint 4: composed from the centralized role-permission
 * matrix, directly per the approved policy — "OWNER: may manage all.
 * ADMIN: may manage according to canManageRecurring. FUNDRAISER: read-only
 * own subscriptions initially, no cancellation or amount/frequency
 * mutation. VIEWER: read-only according to permitted scope." canView uses
 * canViewAllTransactions OR canViewOwnTransactions so FUNDRAISER/VIEWER
 * still see their own list (scoped further by buildSubscriptionScope, not
 * this function) even though they can't mutate.
 */
export function getSubscriptionPermissions(role: SessionRole | null | undefined): SubscriptionPermissions {
  if (role === "wgc_admin") {
    return {
      canView: true,
      canExport: true,
      canCreate: false, // wgc_admin supports/troubleshoots but does not act as the organization to create donor-facing recurring commitments
      canCancel: false,
      canUpdateAmount: false,
      canUpdateFrequency: false,
      canSendPaymentUpdateLink: false,
      canTriggerSync: true,
      canReconcileUnattributed: true, // only wgc_admin may reconcile historical unattributed recurring candidates
    };
  }

  const normalized = normalizeMerchantRole(role);
  if (!normalized) {
    return {
      canView: false,
      canExport: false,
      canCreate: false,
      canCancel: false,
      canUpdateAmount: false,
      canUpdateFrequency: false,
      canSendPaymentUpdateLink: false,
      canTriggerSync: false,
      canReconcileUnattributed: false,
    };
  }

  const base = ROLE_PERMISSIONS[normalized];
  return {
    canView: base.canViewAllTransactions || base.canViewOwnTransactions,
    canExport: base.canExportReports,
    canCreate: base.canManageRecurring,
    canCancel: base.canManageRecurring,
    canUpdateAmount: base.canManageRecurring,
    canUpdateFrequency: base.canManageRecurring,
    canSendPaymentUpdateLink: base.canManageRecurring,
    canTriggerSync: false, // wgc_admin-only, handled above
    canReconcileUnattributed: false, // wgc_admin-only, handled above
  };
}
