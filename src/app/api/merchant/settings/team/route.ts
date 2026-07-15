import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getSettingsPermissions } from "@/lib/settings/settingsPermissions";
import { isValidEmail } from "@/lib/donors/donorContact";
import { sendWgcEmail } from "@/lib/email";
import { logDashboardAction } from "@/lib/dashboardAudit";

function teamMemberView(user: {
  id: string;
  email: string;
  passwordHash: string | null;
  setPasswordTokenExpiresAt: Date | null;
  lastLoginAt: Date | null;
  disabledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
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
    invitationStatus,
    disabled: !!user.disabledAt,
    mfaStatus: "NOT_SUPPORTED" as const,
    lastActive: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function GET() {
  const session = await getSession();
  const permissions = getSettingsPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canView) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const users = await prisma.user.findMany({
    where: { churchId: session.churchId, role: "church_admin" },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ members: users.map(teamMemberView) });
}

export async function POST(req: Request) {
  const session = await getSession();
  const permissions = getSettingsPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canManageTeam) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.churchId === session.churchId) {
      return NextResponse.json({ error: "This person is already a member of your organization" }, { status: 409 });
    }
    return NextResponse.json({ error: "This email is already associated with another account" }, { status: 409 });
  }

  const church = await prisma.church.findUnique({ where: { id: session.churchId }, select: { name: true } });

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const user = await prisma.user.create({
    data: {
      email,
      role: "church_admin",
      churchId: session.churchId,
      setPasswordTokenHash: tokenHash,
      setPasswordTokenExpiresAt: expiresAt,
      invitedByUserId: session.userId,
    },
  });

  const origin = req.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "https://wgcpayments.com";
  const inviteLink = `${origin}/merchant/set-password/${rawToken}`;
  await sendWgcEmail({
    to: email,
    subject: `You've been invited to join ${church?.name || "an organization"} on WGC Payments`,
    title: "You're invited",
    badgeText: "Team Invitation",
    badgeColor: "#0B5DBC",
    bodyHtml: `<p>You've been invited to join <strong>${church?.name || "an organization"}</strong> as an Organization Admin on WGC Payments.</p>
               <p><a href="${inviteLink}">Accept invitation and set your password</a></p>
               <p>This invitation link expires in 7 days.</p>`,
  });

  await logDashboardAction({
    churchId: session.churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "settings.team_member_invited",
    entityType: "user",
    entityId: user.id,
    metadata: { email },
    req,
  });

  return NextResponse.json({ member: teamMemberView(user) }, { status: 201 });
}
