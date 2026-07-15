import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getSettingsPermissions } from "@/lib/settings/settingsPermissions";
import { logDashboardAction } from "@/lib/dashboardAudit";

async function loadTargetInOrg(userId: string, churchId: string) {
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target || target.churchId !== churchId || target.role !== "church_admin") return null;
  return target;
}

async function countActiveAdmins(churchId: string, excludeUserId?: string) {
  return prisma.user.count({
    where: {
      churchId,
      role: "church_admin",
      disabledAt: null,
      passwordHash: { not: null },
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const session = await getSession();
  const permissions = getSettingsPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canManageTeam) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const target = await loadTargetInOrg(userId, session.churchId);
  if (!target) return NextResponse.json({ error: "Team member not found" }, { status: 404 });

  const body = await req.json();
  const action = body.action as "disable" | "enable";
  if (action !== "disable" && action !== "enable") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  if (action === "disable") {
    if (target.id === session.userId) {
      return NextResponse.json({ error: "You can't disable your own access" }, { status: 400 });
    }
    if (!target.disabledAt && target.passwordHash) {
      const remaining = await countActiveAdmins(session.churchId, target.id);
      if (remaining < 1) {
        return NextResponse.json({ error: "An organization must have at least one active Organization Admin" }, { status: 400 });
      }
    }
  }

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: {
      disabledAt: action === "disable" ? new Date() : null,
      disabledByUserId: action === "disable" ? session.userId : null,
    },
  });

  await logDashboardAction({
    churchId: session.churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: action === "disable" ? "settings.team_member_disabled" : "settings.team_member_enabled",
    entityType: "user",
    entityId: target.id,
    metadata: { email: target.email },
    req,
  });

  return NextResponse.json({
    member: { id: updated.id, disabled: !!updated.disabledAt },
  });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const session = await getSession();
  const permissions = getSettingsPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canManageTeam) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const target = await loadTargetInOrg(userId, session.churchId);
  if (!target) return NextResponse.json({ error: "Team member not found" }, { status: 404 });

  if (target.passwordHash) {
    // Never hard-delete a user who has ever actually logged in / has an
    // audit trail of their own — disable instead so history stays intact.
    return NextResponse.json(
      { error: "This member has an active account and can only be disabled, not removed. Disable it first." },
      { status: 400 }
    );
  }
  if (target.id === session.userId) {
    return NextResponse.json({ error: "You can't remove yourself" }, { status: 400 });
  }

  await prisma.user.delete({ where: { id: target.id } });

  await logDashboardAction({
    churchId: session.churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "settings.team_invitation_removed",
    entityType: "user",
    entityId: target.id,
    metadata: { email: target.email },
    req,
  });

  return NextResponse.json({ success: true });
}
