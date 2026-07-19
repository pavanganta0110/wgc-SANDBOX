export { requireMerchantSession, type MerchantAuthContext } from "./requireMerchantSession";
export { normalizeMerchantRole, ROLE_PERMISSIONS, WGC_ADMIN_PERMISSIONS, type NormalizedOrgRole, type RawUserRole, type PermissionKey, type PermissionMatrix } from "./roles";
export { requirePermission, hasPermission, resolveEffectivePermissions, parsePermissionOverrides, OVERRIDABLE_PERMISSION_KEYS } from "./permissions";
export { requireOrganizationAccess, requireFullOrganizationContext } from "./organizationAccess";
export {
  resolveViewScope,
  setViewScope,
  clearViewScope,
  VIEW_SCOPE_COOKIE_NAME,
  type ViewScope,
  type ResolvedViewScope,
} from "./viewScope";
export {
  buildGivingLinkScope,
  buildPaymentScope,
  buildSubscriptionScope,
  buildFinixTransferScope,
  buildRefundScope,
  resolveScopedDonorIds,
  resolveScopedUserId,
  resolveTargetUserId,
  isForcedToOwnData,
  QUARANTINED_GIVING_LINK_IDS,
} from "./scopes";
export { UnauthorizedError, ForbiddenError, isAuthError } from "./errors";
export { resolveGivingLinkOwnerForCreate, validateGivingLinkReassignment } from "./givingLinkOwnership";
