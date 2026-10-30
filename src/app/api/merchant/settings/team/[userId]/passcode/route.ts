import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { requireFullOrganizationContext } from "@/lib/auth/viewScope";
import { isAuthError } from "@/lib/auth/errors";
import { auditImpersonatedWrite } from "@/lib/auth/auditImpersonatedWrite";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { hashFramePasscode, validateFramePasscode } from "@/lib/auth/framePasscode";
import { getEmbedSignInMode } from "@/lib/partners/embedEntry";

const MANAGEABLE_ROLES = ["owner", "admin", "fundraiser", "viewer", "church_admin"];

/**
 * Sets a team member's passcode for signing in from inside the partner's frame. Only for an organization whose
 * partner signs its people in with passcodes. The passcode is hashed like a password and never shown again; setting
 * one also clears any lock from wrong tries. The primary owner's passcode can be set only by the owner themself, so
 * an administrator cannot take over the owner's frame sign-in.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canManageTeam");
    await requireFullOrganizationContext(auth);
    await auditImpersonatedWrite(auth, req);
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const { userId } = await params;
  const body = await req.json().catch(() => ({}));
  const problem = validateFramePasscode(body.passcode);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const church = await prisma.church.findUnique({ where: { id: auth.churchId }, select: { partnerId: true, primaryOwnerUserId: true } });
  if (!church?.partnerId || (await getEmbedSignInMode(church.partnerId)) !== "PASSCODE") {
    return NextResponse.json({ error: "Passcodes are not used for this organization." }, { status: 400 });
  }

  const target = await prisma.user.findFirst({ where: { id: userId, churchId: auth.churchId, role: { in: MANAGEABLE_ROLES } }, select: { id: true, email: true, role: true, disabledAt: true } });
  if (!target || target.disabledAt) return NextResponse.json({ error: "Team member not found." }, { status: 404 });
  if ((target.id === church.primaryOwnerUserId || target.role === "owner") && target.id !== auth.userId) {
    return NextResponse.json({ error: "Only the owner can set the owner's passcode." }, { status: 403 });
  }

  await prisma.user.update({
    where: { id: target.id },
    data: { framePasscodeHash: await hashFramePasscode(body.passcode), framePasscodeSetAt: new Date(), framePasscodeFailedAttempts: 0, framePasscodeLockedUntil: null },
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "settings.team_passcode_set",
    entityType: "user",
    entityId: target.id,
    metadata: { email: target.email },
    req,
  });
  return NextResponse.json({ success: true });
}
