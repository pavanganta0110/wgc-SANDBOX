import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getSettingsPermissions } from "@/lib/settings/settingsPermissions";
import { isValidEmail } from "@/lib/donors/donorContact";
import { sendWgcEmail } from "@/lib/email";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { requireFullOrganizationContext } from "@/lib/auth/viewScope";
import { isAuthError } from "@/lib/auth/errors";

// Team-access Checkpoint 4: the set of role strings that represent a real,
// manageable organization member on the Team page — mirrors
// normalizeMerchantRole's accepted inputs minus wgc_admin.
const MANAGEABLE_ORG_ROLES = ["church_admin", "owner", "admin", "fundraiser", "viewer"] as const;

function teamMemberView(user: {
  id: string;
  email: string;
  role: string;
  passwordHash: string | null;
  setPasswordTokenExpiresAt: Date | null;
  lastLoginAt: Date | null;
  disabledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  permissionsJson?: unknown;
}) {
  const invitePending = !user.passwordHash;
  const inviteExpired = invitePending && (!user.setPasswordTokenExpiresAt || user.setPasswordTokenExpiresAt < new Date());
  let invitationStatus: "PENDING" | "EXPIRED" | "ACCEPTED";
  if (!invitePending) invitationStatus = "ACCEPTED";
  else if (inviteExpired) invitationStatus = "EXPIRED";
  else invitationStatus = "PENDING";

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    invitationStatus,
    disabled: !!user.disabledAt,
    mfaStatus: "NOT_SUPPORTED" as const,
    lastActive: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    permissionOverrides: user.permissionsJson && typeof user.permissionsJson === "object" ? user.permissionsJson : {},
  };
}

const INVITABLE_ROLES = ["admin", "fundraiser", "viewer"] as const;

export async function GET() {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const permissions = getSettingsPermissions(auth.rawRole);
  if (!permissions.canView) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Team-access Checkpoint 4: was filtered to role: "church_admin" only —
  // hid every user migrated to owner/admin/fundraiser/viewer in the
  // Checkpoint 2 backfill, making the Team page appear empty for every
  // migrated church.
  const users = await prisma.user.findMany({
    where: { churchId: auth.churchId, role: { in: [...MANAGEABLE_ORG_ROLES] } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ members: users.map(teamMemberView) });
}

export async function POST(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canManageTeam");
    await requireFullOrganizationContext(auth);
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const body = await req.json();
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });
  }
  const requestedRole = typeof body.role === "string" ? body.role : "admin";
  if (!INVITABLE_ROLES.includes(requestedRole as any)) {
    return NextResponse.json({ error: "Role must be one of: admin, fundraiser, viewer" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.churchId === auth.churchId) {
      return NextResponse.json({ error: "This person is already a member of your organization" }, { status: 409 });
    }
    return NextResponse.json({ error: "This email is already associated with another account" }, { status: 409 });
  }

  const church = await prisma.church.findUnique({ where: { id: auth.churchId }, select: { name: true } });

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const user = await prisma.user.create({
    data: {
      email,
      role: requestedRole,
      churchId: auth.churchId,
      setPasswordTokenHash: tokenHash,
      setPasswordTokenExpiresAt: expiresAt,
      invitedByUserId: auth.userId,
    },
  });

  const roleLabel = requestedRole.charAt(0).toUpperCase() + requestedRole.slice(1);
  const origin = req.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "https://wgcpayments.com";
  const inviteLink = `${origin}/merchant/set-password/${rawToken}`;
  await sendWgcEmail({
    to: email,
    subject: `You've been invited to join ${church?.name || "an organization"} on WGC Payments`,
    title: "You're invited",
    badgeText: "Team Invitation",
    badgeColor: "#0B5DBC",
    bodyHtml: `<p>You've been invited to join <strong>${church?.name || "an organization"}</strong> as a ${roleLabel} on WGC Payments.</p>
               <p><a href="${inviteLink}">Accept invitation and set your password</a></p>
               <p>This invitation link expires in 7 days.</p>`,
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "settings.team_member_invited",
    entityType: "user",
    entityId: user.id,
    metadata: { email, role: requestedRole },
    req,
  });

  return NextResponse.json({ member: teamMemberView(user) }, { status: 201 });
}
