import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSettingsPermissions } from "@/lib/settings/settingsPermissions";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { requireFullOrganizationContext } from "@/lib/auth/viewScope";
import { bumpAuthVersion } from "@/lib/auth/session";
import { isAuthError } from "@/lib/auth/errors";
import { normalizeMerchantRole } from "@/lib/auth/roles";
import { OVERRIDABLE_PERMISSION_KEYS, parsePermissionOverrides } from "@/lib/auth/permissions";

const EDITABLE_ROLES = ["admin", "fundraiser", "viewer"] as const;

// Team-access Checkpoint 4: was `target.role !== "church_admin"`, which
// rejected every user migrated to owner/admin/fundraiser/viewer in the
// Checkpoint 2 backfill — this route was completely broken for them.
// normalizeMerchantRole returning null (unknown role, or wgc_admin) is the
// correct "not a manageable org member" check now.
async function loadTargetInOrg(userId: string, churchId: string) {
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target || target.churchId !== churchId || !normalizeMerchantRole(target.role)) return null;
  return target;
}

async function hasHistoricalData(churchId: string, userId: string): Promise<boolean> {
  const [givingLinks, payments, subscriptions, auditRecords] = await Promise.all([
    prisma.givingLink.count({ where: { churchId, OR: [{ createdByUserId: userId }, { ownerUserId: userId }] } }),
    prisma.payment.count({ where: { churchId, OR: [{ createdByAdminUserId: userId }, { attributedUserId: userId }] } }),
    prisma.finixSubscription.count({ where: { churchId, OR: [{ createdByUserId: userId }, { attributedUserId: userId }] } }),
    prisma.dashboardAuditLog.count({ where: { churchId, actorUserId: userId } }),
  ]);
  return givingLinks > 0 || payments > 0 || subscriptions > 0 || auditRecords > 0;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canManageTeam");
    // Disable/reactivate is one of the sensitive settings actions blocked
    // while an admin is viewing another user's scope, per the approved spec.
    await requireFullOrganizationContext(auth);
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const target = await loadTargetInOrg(userId, auth.churchId);
  if (!target) return NextResponse.json({ error: "Team member not found" }, { status: 404 });

  const body = await req.json();
  const action = body.action as "disable" | "enable" | "update_role";
  if (action !== "disable" && action !== "enable" && action !== "update_role") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  if (action === "update_role") {
    const church = await prisma.church.findUnique({ where: { id: auth.churchId }, select: { primaryOwnerUserId: true } });
    if (church?.primaryOwnerUserId === target.id) {
      return NextResponse.json({ error: "The primary owner's role can't be changed here." }, { status: 400 });
    }
    const role = body.role;
    if (!EDITABLE_ROLES.includes(role)) {
      return NextResponse.json({ error: "Role must be one of: admin, fundraiser, viewer" }, { status: 400 });
    }
    // Grant-only overrides: an admin can hand a teammate extra access
    // beyond their role's defaults, but never use this endpoint to strip a
    // permission the role would otherwise carry (that's a role change, not
    // an override) — parsePermissionOverrides already allowlists keys.
    const overrides = parsePermissionOverrides(body.permissionOverrides);
    const grantOnlyOverrides: Record<string, boolean> = {};
    for (const key of OVERRIDABLE_PERMISSION_KEYS) {
      if (overrides[key] === true) grantOnlyOverrides[key] = true;
    }

    const updated = await prisma.user.update({
      where: { id: target.id },
      data: { role, permissionsJson: Object.keys(grantOnlyOverrides).length > 0 ? grantOnlyOverrides : Prisma.JsonNull },
    });
    await bumpAuthVersion(target.id);

    await logDashboardAction({
      churchId: auth.churchId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.rawRole,
      action: "settings.team_member_role_updated",
      entityType: "user",
      entityId: target.id,
      metadata: { email: target.email, role, permissionOverrides: grantOnlyOverrides },
      req,
    });

    return NextResponse.json({ member: { id: updated.id, role: updated.role, permissionOverrides: grantOnlyOverrides } });
  }

  if (action === "disable") {
    if (target.id === auth.userId) {
      return NextResponse.json({ error: "You can't disable your own access" }, { status: 400 });
    }
    const church = await prisma.church.findUnique({ where: { id: auth.churchId }, select: { primaryOwnerUserId: true } });
    if (church?.primaryOwnerUserId === target.id) {
      return NextResponse.json(
        { error: "The primary owner can't be disabled. Transfer ownership first." },
        { status: 400 }
      );
    }
  }

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: {
      disabledAt: action === "disable" ? new Date() : null,
      disabledByUserId: action === "disable" ? auth.userId : null,
    },
  });

  if (action === "disable") {
    // Checkpoint 3 follow-up correction #3: disablement must invalidate any
    // session the disabled user currently holds, immediately — not just at
    // their next login attempt (login is already blocked separately).
    await bumpAuthVersion(target.id);
  }

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
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

/**
 * Team-access Checkpoint 4A correction #8: this route must NEVER call
 * prisma.user.delete/deleteMany, unconditionally — not even for a
 * never-activated invite with zero history (the Checkpoint 3 version of
 * this route allowed that exception; that exception is now removed).
 * "Removing" a team member always means: revoke any pending invitation
 * token, soft-disable (disabledAt/disabledByUserId), and bump authVersion —
 * identical to PATCH ...{action:"disable"}, plus token revocation. Email,
 * role, and full historical identity are preserved either way.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canManageTeam");
    await requireFullOrganizationContext(auth);
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const target = await loadTargetInOrg(userId, auth.churchId);
  if (!target) return NextResponse.json({ error: "Team member not found" }, { status: 404 });

  if (target.id === auth.userId) {
    return NextResponse.json({ error: "You can't remove yourself" }, { status: 400 });
  }

  const church = await prisma.church.findUnique({ where: { id: auth.churchId }, select: { primaryOwnerUserId: true } });
  if (church?.primaryOwnerUserId === target.id) {
    return NextResponse.json(
      { error: "The primary owner can't be removed. Transfer ownership first." },
      { status: 400 }
    );
  }

  if (target.disabledAt) {
    return NextResponse.json({ error: "This member is already disabled." }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: target.id },
    data: {
      disabledAt: new Date(),
      disabledByUserId: auth.userId,
      // Revoke any still-pending invitation so the link can no longer be
      // used to set a password and activate the account.
      setPasswordTokenHash: null,
      setPasswordTokenExpiresAt: null,
    },
  });
  await bumpAuthVersion(target.id);

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "settings.team_member_removed",
    entityType: "user",
    entityId: target.id,
    metadata: { email: target.email, hadHistoricalData: await hasHistoricalData(auth.churchId, target.id) },
    req,
  });

  return NextResponse.json({ success: true });
}
