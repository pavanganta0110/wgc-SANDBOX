import { getAdminSession } from "@/lib/auth/session";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { sendWgcEmail } from "@/lib/email";
import { isValidEmail } from "@/lib/donors/donorContact";

// WGC support previously had no way to invite a brand-new team member to
// an organization on the merchant's behalf — the only admin "invite"-shaped
// action (RESEND_INVITE, see /api/admin/support/actions/user) required an
// existing userId, so a support agent could only re-send a link to someone
// who already had a User row (e.g. from onboarding). This fills that gap
// using the same real invite-link email as every other invite path in this
// codebase (merchant Team-invite route, onboarding's DASHBOARD_ACCESS send).
const INVITABLE_ROLES = ["admin", "fundraiser", "viewer"] as const;

export async function POST(req: Request, { params }: { params: Promise<{ churchId: string }> }) {
  const { churchId } = await params;

  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminUser = await prisma.user.findUnique({ where: { id: session.userId }, select: { permissionsJson: true } });
  const permissions = adminUser?.permissionsJson as Record<string, boolean> | null;
  const canManageSupport = session.role === "wgc_super_admin" || (session.role === "wgc_admin" && permissions?.canManageUsers === true);
  if (!canManageSupport) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = typeof body.role === "string" ? body.role : "admin";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });
  }
  if (!INVITABLE_ROLES.includes(role as any)) {
    return NextResponse.json({ error: "Role must be one of: admin, fundraiser, viewer" }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ error: "Reason is required" }, { status: 400 });
  }

  const church = await prisma.church.findUnique({ where: { id: churchId }, select: { name: true } });
  if (!church) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: existing.churchId === churchId ? "This person is already a member of this organization" : "This email is already associated with another account" },
      { status: 409 }
    );
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const user = await prisma.user.create({
    data: {
      email,
      role,
      churchId,
      setPasswordTokenHash: tokenHash,
      setPasswordTokenExpiresAt: expiresAt,
      invitedByUserId: session.userId,
    },
  });

  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
  const setPasswordLink = `${process.env.NEXT_PUBLIC_APP_URL || "https://www.wgcpayments.com"}/merchant/set-password/${rawToken}`;
  const emailResult = await sendWgcEmail({
    to: email,
    subject: `You've been invited to join ${church.name} on WGC Payments`,
    title: "You're invited",
    badgeText: "Team Invitation",
    badgeColor: "#0B5DBC",
    bodyHtml: `<p>You've been invited to join <strong>${church.name}</strong> as a ${roleLabel} on WGC Payments.</p>
               <p><a href="${setPasswordLink}">Accept invitation and set your password</a></p>
               <p>This invitation link expires in 7 days.</p>`,
  });

  await prisma.emailLog.create({
    data: {
      type: "DASHBOARD_ACCESS",
      to: email,
      subject: `You've been invited to join ${church.name} on WGC Payments`,
      status: emailResult.success ? "SENT" : "ERROR",
      sentAt: emailResult.success ? new Date() : null,
      error: emailResult.success ? null : String(emailResult.error ?? "unknown error"),
    },
  });

  await prisma.auditLog.create({
    data: {
      action: "USER_INVITED_BY_SUPPORT",
      actorEmail: session.email,
      metadata: { userId: user.id, churchId, email, role, reason, emailSent: emailResult.success },
    },
  });

  if (!emailResult.success) {
    return NextResponse.json({ error: "Account created, but the invitation email failed to send. Check the admin Email Logs for details." }, { status: 502 });
  }

  return NextResponse.json({ message: `Invitation sent to ${email}.` }, { status: 201 });
}
