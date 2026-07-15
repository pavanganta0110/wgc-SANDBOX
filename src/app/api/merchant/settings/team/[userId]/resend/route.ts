import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getSettingsPermissions } from "@/lib/settings/settingsPermissions";
import { sendWgcEmail } from "@/lib/email";
import { logDashboardAction } from "@/lib/dashboardAudit";

export async function POST(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const session = await getSession();
  const permissions = getSettingsPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canManageTeam) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target || target.churchId !== session.churchId || target.role !== "church_admin") {
    return NextResponse.json({ error: "Team member not found" }, { status: 404 });
  }
  if (target.passwordHash) {
    return NextResponse.json({ error: "This member has already accepted their invitation" }, { status: 400 });
  }

  const church = await prisma.church.findUnique({ where: { id: session.churchId }, select: { name: true } });

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await prisma.user.update({
    where: { id: target.id },
    data: { setPasswordTokenHash: tokenHash, setPasswordTokenExpiresAt: expiresAt },
  });

  const origin = req.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "https://wgcpayments.com";
  const inviteLink = `${origin}/merchant/set-password/${rawToken}`;
  await sendWgcEmail({
    to: target.email,
    subject: `Reminder: you've been invited to join ${church?.name || "an organization"} on WGC Payments`,
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
    action: "settings.team_invitation_resent",
    entityType: "user",
    entityId: target.id,
    metadata: { email: target.email },
    req,
  });

  return NextResponse.json({ success: true });
}
