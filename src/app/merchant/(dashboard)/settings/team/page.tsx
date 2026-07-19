import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSettingsPermissions } from "@/lib/settings/settingsPermissions";
import TeamSettingsPanel from "@/components/merchant/TeamSettingsPanel";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";

const MANAGEABLE_ORG_ROLES = ["church_admin", "owner", "admin", "fundraiser", "viewer"] as const;

export default async function TeamSettingsPage() {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/dashboard");
    throw err;
  }
  const permissions = getSettingsPermissions(auth.rawRole);
  if (!permissions.canView) redirect("/merchant/dashboard");

  const [users, church] = await Promise.all([
    // Team-access: was filtered to role: "church_admin" only — hid every
    // user migrated to owner/admin/fundraiser/viewer, making this page
    // appear to have no team for any migrated organization.
    prisma.user.findMany({
      where: { churchId: auth.churchId, role: { in: [...MANAGEABLE_ORG_ROLES] } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.church.findUnique({ where: { id: auth.churchId }, select: { primaryOwnerUserId: true } }),
  ]);

  const members = users.map((user) => {
    const invitePending = !user.passwordHash;
    const inviteExpired = invitePending && (!user.setPasswordTokenExpiresAt || user.setPasswordTokenExpiresAt < new Date());
    const invitationStatus: "PENDING" | "EXPIRED" | "ACCEPTED" = !invitePending ? "ACCEPTED" : inviteExpired ? "EXPIRED" : "PENDING";
    const overrides =
      user.permissionsJson && typeof user.permissionsJson === "object" && !Array.isArray(user.permissionsJson)
        ? (user.permissionsJson as Record<string, boolean>)
        : {};
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      invitationStatus,
      disabled: !!user.disabledAt,
      mfaStatus: "NOT_SUPPORTED" as const,
      lastActive: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
      isSelf: user.id === auth.userId,
      isPrimaryOwner: user.id === church?.primaryOwnerUserId,
      permissionOverrides: overrides,
    };
  });

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <h3 className="text-sm font-bold text-slate-900 mb-1">Team &amp; Access</h3>
      <p className="text-xs text-slate-500 mb-6">
        Manage who has access to your WGC Payments dashboard, their role, and reporting scope. Multi-factor authentication is not currently supported.
      </p>
      <TeamSettingsPanel initialMembers={members} canManageTeam={permissions.canManageTeam} />
    </div>
  );
}
