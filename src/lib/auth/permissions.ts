import {
  ROLE_PERMISSIONS,
  WGC_ADMIN_PERMISSIONS,
  type PermissionKey,
  type PermissionMatrix,
} from "./roles";
import type { MerchantAuthContext } from "./requireMerchantSession";
import { ForbiddenError } from "./errors";

/**
 * The only permissionsJson keys ever honored. Deliberately excludes
 * canManageOrgSettings, canManageRolesAndPermissions, and
 * canTransferOwnership — those are structural/high-risk and can only ever
 * come from the base role, never from a per-user override blob.
 */
export const OVERRIDABLE_PERMISSION_KEYS: readonly PermissionKey[] = [
  "canManageTeam",
  "canCreateGivingLinks",
  "canEditOwnGivingLinks",
  "canEditAllGivingLinks",
  "canViewOwnTransactions",
  "canViewAllTransactions",
  "canIssueRefunds",
  "canViewDonors",
  "canExportReports",
  "canManageRecurring",
  "canViewSettlements",
  "canManageBankAccount",
  "canManageBilling",
  "canViewAsUser",
];

/**
 * Parses and allowlist-validates a raw permissionsJson value. Unknown keys
 * are silently dropped (not thrown) so a stale/corrupt override blob never
 * takes down a request — it just loses effect, which is the safe direction.
 * Non-boolean values for a known key are also dropped.
 */
export function parsePermissionOverrides(raw: unknown): Partial<PermissionMatrix> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const input = raw as Record<string, unknown>;
  const result: Partial<PermissionMatrix> = {};
  for (const key of OVERRIDABLE_PERMISSION_KEYS) {
    const value = input[key];
    if (typeof value === "boolean") result[key] = value;
  }
  return result;
}

/**
 * Resolves the effective permission matrix for a user: base role
 * permissions with any allowlisted permissionsJson overrides layered on
 * top. An override can both grant a permission the role doesn't normally
 * have and deny one it does (explicit false always wins over the role
 * default), per the approved spec.
 */
export function resolveEffectivePermissions(auth: Pick<MerchantAuthContext, "role" | "isWgcAdmin" | "permissionsJson">): PermissionMatrix {
  const base = auth.isWgcAdmin
    ? WGC_ADMIN_PERMISSIONS
    : auth.role
      ? ROLE_PERMISSIONS[auth.role]
      : undefined;

  // Unknown/unnormalizable role: deny everything. Never guess.
  if (!base) {
    return {
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
  }

  // wgc_admin never accepts permissionsJson overrides — its matrix is fixed.
  if (auth.isWgcAdmin) return base;

  const overrides = parsePermissionOverrides(auth.permissionsJson);
  return { ...base, ...overrides };
}

/**
 * Throws ForbiddenError unless the authenticated user's effective
 * permissions grant `permission`. Always resolved server-side from the DB
 * role + permissionsJson — never trusts a client-supplied claim.
 */
export function requirePermission(auth: MerchantAuthContext, permission: PermissionKey): void {
  const effective = resolveEffectivePermissions(auth);
  if (!effective[permission]) {
    throw new ForbiddenError(`Missing required permission: ${permission}`);
  }
}

export function hasPermission(auth: MerchantAuthContext, permission: PermissionKey): boolean {
  return resolveEffectivePermissions(auth)[permission];
}
