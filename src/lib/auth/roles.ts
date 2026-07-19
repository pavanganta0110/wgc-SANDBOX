/**
 * Team-access Checkpoint 2: the single source of truth for what each
 * organization role can do. Roles are the primary model; requirePermission()
 * in permissions.ts layers a small per-user permissionsJson override on top
 * of whatever this file returns.
 */

/** Normalized organization-side role. "wgc_admin" is WGC's own internal
 * support role and is intentionally never included here — it's tracked
 * separately (see MerchantAuthContext.isWgcAdmin) so it can never be
 * silently treated as an organization owner by code that only checks
 * NormalizedOrgRole. */
export type NormalizedOrgRole = "owner" | "admin" | "fundraiser" | "viewer";

/** Every role string that can appear in User.role, including the internal
 * wgc_admin role and the pre-Checkpoint-1 legacy value. */
export type RawUserRole = "wgc_admin" | "church_admin" | "owner" | "admin" | "fundraiser" | "viewer";

/**
 * Normalizes legacy/raw role strings for permission resolution.
 * - "church_admin" (pre-Checkpoint-1 legacy) -> "admin"-equivalent
 * - "owner" | "admin" | "fundraiser" | "viewer" -> themselves
 * - "wgc_admin" -> null (never a normalized org role; callers must check
 *   isWgcAdmin separately and must not fall back to treating it as "owner")
 * - anything else -> null (deny by default, never guess)
 *
 * This does NOT rewrite any database row — it only affects how an
 * already-stored role string is interpreted for permission checks in this
 * request. Rewriting church_admin rows happens only via the explicit,
 * reviewed owner-backfill migration (see the Checkpoint 2 report).
 */
export function normalizeMerchantRole(role: string | null | undefined): NormalizedOrgRole | null {
  switch (role) {
    case "church_admin":
      return "admin";
    case "owner":
    case "admin":
    case "fundraiser":
    case "viewer":
      return role;
    case "wgc_admin":
      return null;
    default:
      return null;
  }
}

/** The full set of permission flags recognized anywhere in the app. Includes
 * both the overridable set (see OVERRIDABLE_PERMISSION_KEYS in
 * permissions.ts) and a few structural/high-risk permissions that are never
 * accepted from permissionsJson (org settings, role management, ownership
 * transfer) — those can only ever come from the base role. */
export type PermissionKey =
  | "canManageTeam"
  | "canCreateGivingLinks"
  | "canEditOwnGivingLinks"
  | "canEditAllGivingLinks"
  | "canViewOwnTransactions"
  | "canViewAllTransactions"
  | "canIssueRefunds"
  | "canViewDonors"
  | "canExportReports"
  | "canManageRecurring"
  | "canViewSettlements"
  | "canManageBankAccount"
  | "canManageBilling"
  | "canViewAsUser"
  | "canManageOrgSettings"
  | "canManageRolesAndPermissions"
  | "canTransferOwnership";

export type PermissionMatrix = Record<PermissionKey, boolean>;

const ALL_FALSE: PermissionMatrix = {
  canManageTeam: false,
  canCreateGivingLinks: false,
  canEditOwnGivingLinks: false,
  canEditAllGivingLinks: false,
  canViewOwnTransactions: false,
  canViewAllTransactions: false,
  canIssueRefunds: false,
  canViewDonors: false,
  canExportReports: false,
  canManageRecurring: false,
  canViewSettlements: false,
  canManageBankAccount: false,
  canManageBilling: false,
  canViewAsUser: false,
  canManageOrgSettings: false,
  canManageRolesAndPermissions: false,
  canTransferOwnership: false,
};

/** Base permission matrix per normalized role, per the approved Checkpoint 2 spec. */
export const ROLE_PERMISSIONS: Record<NormalizedOrgRole, PermissionMatrix> = {
  owner: {
    ...ALL_FALSE,
    canManageTeam: true,
    canCreateGivingLinks: true,
    canEditOwnGivingLinks: true,
    canEditAllGivingLinks: true,
    canViewOwnTransactions: true,
    canViewAllTransactions: true,
    canIssueRefunds: true,
    canViewDonors: true,
    canExportReports: true,
    canManageRecurring: true,
    canViewSettlements: true,
    canManageBankAccount: true,
    canManageBilling: true,
    canViewAsUser: true,
    canManageOrgSettings: true,
    canManageRolesAndPermissions: true,
    canTransferOwnership: true,
  },
  admin: {
    ...ALL_FALSE,
    // "Manage team only if permitted" / "if permitted" flags below are
    // false at the base-role level on purpose — an ADMIN gets them only via
    // an explicit permissionsJson override, never automatically.
    canCreateGivingLinks: true,
    canEditOwnGivingLinks: true,
    canEditAllGivingLinks: true,
    canViewOwnTransactions: true,
    canViewAllTransactions: true,
    canViewDonors: true,
    canExportReports: true,
    canManageRecurring: true,
    canViewSettlements: true,
    canManageOrgSettings: true,
    // canManageTeam, canIssueRefunds, canManageBankAccount, canManageBilling,
    // canViewAsUser: false by default, override-able.
    // canManageRolesAndPermissions, canTransferOwnership: never granted to
    // ADMIN, not override-able (see permissions.ts OVERRIDABLE_PERMISSION_KEYS).
  },
  fundraiser: {
    ...ALL_FALSE,
    canCreateGivingLinks: true,
    canEditOwnGivingLinks: true,
    canViewOwnTransactions: true,
    canViewDonors: true, // scope-limited to donors tied to their attributed payments; see buildGivingLinkScope/buildPaymentScope
  },
  // Checkpoint 2 correction: VIEWER defaults to the narrowest possible
  // read scope (their own transactions only) — org-wide transaction view,
  // donor PII, and settlement/bank info are never exposed by default.
  // Broader read access (canViewAllTransactions, canViewDonors,
  // canViewSettlements, canExportReports) can only come from an explicit,
  // reviewed permissionsJson override on a specific user, never the base role.
  viewer: {
    ...ALL_FALSE,
    canViewOwnTransactions: true,
    // Explicitly no mutations of any kind (no create/edit links, no refunds,
    // no bank/billing/team management) per the approved spec.
  },
};

/** wgc_admin is deliberately NOT part of ROLE_PERMISSIONS (NormalizedOrgRole
 * excludes it). This is its own fixed, narrow internal-support matrix —
 * kept explicit and separate so it can never inherit organization-owner
 * permissions by falling through a shared code path. */
export const WGC_ADMIN_PERMISSIONS: PermissionMatrix = {
  ...ALL_FALSE,
  canViewAllTransactions: true,
  canViewDonors: true,
  canViewSettlements: true,
};
