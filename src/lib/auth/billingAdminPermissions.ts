/**
 * WGC-staff-side permissions for the Billing & Subscriptions admin
 * dashboard — deliberately a SEPARATE type from the merchant-side
 * PermissionKey/PermissionMatrix in roles.ts. Those two systems share no
 * structural relationship: an organization owner's canManageSubscription
 * governs THEIR OWN organization's subscription; these keys govern a WGC
 * staff member's ability to manage EVERY organization's billing, pricing,
 * and promotions platform-wide. Reusing one PermissionMatrix type for both
 * would force every high-risk WGC-admin key to also exist (and default to
 * false) in every merchant role's matrix, which is confusing and invites
 * an accidental grant.
 *
 * "Do not give every WGC admin every financial permission automatically" —
 * per the approved spec, wgc_admin defaults to view-only; the high-risk
 * keys are true only for wgc_super_admin or a wgc_admin explicitly flagged
 * as a designated billing administrator via permissionsJson.isBillingAdmin
 * (reuses the existing User.permissionsJson override column rather than a
 * new schema field).
 */

export type WgcAdminBillingPermissionKey =
  | "canViewBilling"
  | "canManageBilling"
  | "canManagePricing"
  | "canManagePromotions"
  | "canGrantFreeMonths"
  | "canApplyBillingCredits"
  | "canRefundWgcCharges"
  | "canCancelSubscriptions"
  | "canManageInvoiceBilling"
  | "canExportBillingData"
  | "canManageBillingTerms"
  | "canViewBillingAuditLog";

export type WgcAdminBillingPermissionMatrix = Record<WgcAdminBillingPermissionKey, boolean>;

const ALL_FALSE: WgcAdminBillingPermissionMatrix = {
  canViewBilling: false,
  canManageBilling: false,
  canManagePricing: false,
  canManagePromotions: false,
  canGrantFreeMonths: false,
  canApplyBillingCredits: false,
  canRefundWgcCharges: false,
  canCancelSubscriptions: false,
  canManageInvoiceBilling: false,
  canExportBillingData: false,
  canManageBillingTerms: false,
  canViewBillingAuditLog: false,
};

/** wgc_super_admin: every billing-admin permission, always — not
 * overridable, same pattern as the merchant-side WGC_ADMIN_PERMISSIONS. */
export const WGC_SUPER_ADMIN_BILLING_PERMISSIONS: WgcAdminBillingPermissionMatrix = {
  canViewBilling: true,
  canManageBilling: true,
  canManagePricing: true,
  canManagePromotions: true,
  canGrantFreeMonths: true,
  canApplyBillingCredits: true,
  canRefundWgcCharges: true,
  canCancelSubscriptions: true,
  canManageInvoiceBilling: true,
  canExportBillingData: true,
  canManageBillingTerms: true,
  canViewBillingAuditLog: true,
};

/** wgc_admin base matrix: view-only. Every mutating/financial-override key
 * stays false unless the admin is explicitly designated a billing
 * administrator (see resolveWgcAdminBillingPermissions). */
export const WGC_ADMIN_BASE_BILLING_PERMISSIONS: WgcAdminBillingPermissionMatrix = {
  ...ALL_FALSE,
  canViewBilling: true,
  canViewBillingAuditLog: true,
  canExportBillingData: true,
};

/** Every key a designated wgc_admin billing administrator gets, layered on
 * top of the view-only base — everything except nothing; a designated
 * billing administrator is trusted with the full set, same ceiling as
 * super_admin for billing specifically (super_admin's extra scope is
 * elsewhere in the app, not additional billing keys). */
const DESIGNATED_BILLING_ADMIN_PERMISSIONS: WgcAdminBillingPermissionMatrix = { ...WGC_SUPER_ADMIN_BILLING_PERMISSIONS };

/**
 * Resolves the effective WGC-admin billing permission matrix. Always
 * server-side — never trusts a client-supplied claim of admin status.
 *
 * @param role "wgc_super_admin" | "wgc_admin" (anything else denies all)
 * @param permissionsJson the admin User row's permissionsJson — only the
 *   boolean `isBillingAdmin` key is ever consulted from it here.
 */
export function resolveWgcAdminBillingPermissions(
  role: string | null | undefined,
  permissionsJson?: unknown,
): WgcAdminBillingPermissionMatrix {
  if (role === "wgc_super_admin") return WGC_SUPER_ADMIN_BILLING_PERMISSIONS;
  if (role !== "wgc_admin") return { ...ALL_FALSE };

  const isBillingAdmin =
    permissionsJson && typeof permissionsJson === "object" && !Array.isArray(permissionsJson)
      ? (permissionsJson as Record<string, unknown>).isBillingAdmin === true
      : false;

  return isBillingAdmin ? DESIGNATED_BILLING_ADMIN_PERMISSIONS : WGC_ADMIN_BASE_BILLING_PERMISSIONS;
}

export function hasWgcAdminBillingPermission(
  role: string | null | undefined,
  permissionsJson: unknown,
  permission: WgcAdminBillingPermissionKey,
): boolean {
  return resolveWgcAdminBillingPermissions(role, permissionsJson)[permission];
}
