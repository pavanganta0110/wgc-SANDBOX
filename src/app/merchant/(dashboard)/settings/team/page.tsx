import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getSettingsPermissions } from "@/lib/settings/settingsPermissions";
import TeamSettingsPanel from "@/components/merchant/TeamSettingsPanel";

export default async function TeamSettingsPage() {
  const session = await getSession();
  const permissions = getSettingsPermissions(session?.role);
  const users = await prisma.user.findMany({
    where: { churchId: session!.churchId!, role: "church_admin" },
    orderBy: { createdAt: "asc" },
  });

  const members = users.map((user) => {
    const invitePending = !user.passwordHash;
    const inviteExpired = invitePending && (!user.setPasswordTokenExpiresAt || user.setPasswordTokenExpiresAt < new Date());
    const invitationStatus: "PENDING" | "EXPIRED" | "ACCEPTED" = !invitePending ? "ACCEPTED" : inviteExpired ? "EXPIRED" : "PENDING";
    return {
      id: user.id,
      email: user.email,
      invitationStatus,
      disabled: !!user.disabledAt,
      mfaStatus: "NOT_SUPPORTED" as const,
      lastActive: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
      isSelf: user.id === session!.userId,
    };
  });

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <h3 className="text-sm font-bold text-slate-900 mb-1">Team &amp; Access</h3>
      <p className="text-xs text-slate-500 mb-6">
        Manage who has Organization Admin access to your WGC Payments dashboard. Multi-factor authentication is not currently supported.
      </p>
      <TeamSettingsPanel initialMembers={members} canManageTeam={permissions.canManageTeam} />
    </div>
  );
}
