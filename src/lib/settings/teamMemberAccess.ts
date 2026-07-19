import { hasPermission } from "@/lib/auth/permissions";
import { getSettingsPermissions } from "@/lib/settings/settingsPermissions";
import type { MerchantAuthContext } from "@/lib/auth/requireMerchantSession";

/**
 * Who may open /merchant/settings/team/[userId] for a given target.
 * - Always allowed for your own page (self-view).
 * - Otherwise requires the same "can manage/view other people's scope"
 *   gate the Team page and view-scope selector already use
 *   (canManageTeam or canViewAsUser) — OWNER has both by default, ADMIN
 *   only via an explicit permissionsJson override, FUNDRAISER/VIEWER never.
 * - Cross-church targets are always rejected regardless of role.
 */
export function canOpenTeamMemberDetail(
  auth: MerchantAuthContext,
  target: { id: string; churchId: string | null }
): boolean {
  if (target.churchId !== auth.churchId) return false;
  if (target.id === auth.userId) return true;
  return hasPermission(auth, "canManageTeam") || hasPermission(auth, "canViewAsUser");
}

/** Export is a stricter subset of view access — never available for a
 * fundraiser/viewer exporting someone else's data, self-export of your own
 * scoped record is fine for anyone who could already view this page. */
export function canExportTeamMemberData(auth: MerchantAuthContext, target: { id: string; churchId: string | null }): boolean {
  if (!canOpenTeamMemberDetail(auth, target)) return false;
  if (target.id === auth.userId) return true;
  return getSettingsPermissions(auth.rawRole).canManageTeam;
}
