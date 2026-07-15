/** Mirrors src/lib/donors/donorPermissions.ts — same two real roles, church_admin always labeled "Organization Admin" in UI. */
export type SessionRole = "wgc_admin" | "church_admin";

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
  if (role === "church_admin") {
    return {
      canView: true,
      canExport: true,
      canCreate: true,
      canCancel: true,
      canUpdateAmount: true,
      canUpdateFrequency: true,
      canSendPaymentUpdateLink: true,
      canTriggerSync: false,
      canReconcileUnattributed: false,
    };
  }
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
