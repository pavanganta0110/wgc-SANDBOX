import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";
import { sendWgcEmail } from "@/lib/email";

async function countActiveSuperAdmins(excludeUserId?: string) {
  return prisma.user.count({
    where: {
      role: "wgc_super_admin",
      disabledAt: null,
      id: excludeUserId ? { not: excludeUserId } : undefined,
    },
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session || session.role !== "wgc_super_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body.action;

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target || (target.role !== "wgc_admin" && target.role !== "wgc_super_admin")) {
    return NextResponse.json({ error: "Admin not found" }, { status: 404 });
  }

  switch (action) {
    case "disable": {
      if (target.role === "wgc_super_admin" && !target.disabledAt) {
        const remaining = await countActiveSuperAdmins(target.id);
        if (remaining === 0) {
          return NextResponse.json({ error: "Cannot disable the last active Super Admin." }, { status: 400 });
        }
      }
      const updated = await prisma.user.update({
        where: { id },
        data: { disabledAt: new Date(), disabledByUserId: session.userId },
      });
      await prisma.auditLog.create({
        data: { action: "ADMIN_DISABLED", actorEmail: session.email, metadata: { targetUserId: id } },
      });
      return NextResponse.json({ admin: { id: updated.id, disabled: true } });
    }

    case "reactivate": {
      const updated = await prisma.user.update({
        where: { id },
        data: { disabledAt: null, disabledByUserId: null },
      });
      await prisma.auditLog.create({
        data: { action: "ADMIN_REACTIVATED", actorEmail: session.email, metadata: { targetUserId: id } },
      });
      return NextResponse.json({ admin: { id: updated.id, disabled: false } });
    }

    case "promote": {
      if (target.role === "wgc_super_admin") {
        return NextResponse.json({ error: "This admin is already a Super Admin." }, { status: 400 });
      }
      const updated = await prisma.user.update({ where: { id }, data: { role: "wgc_super_admin" } });
      await prisma.auditLog.create({
        data: { action: "ADMIN_ROLE_CHANGED", actorEmail: session.email, metadata: { targetUserId: id, newRole: "wgc_super_admin" } },
      });
      return NextResponse.json({ admin: { id: updated.id, role: updated.role } });
    }

    case "demote": {
      if (target.role !== "wgc_super_admin") {
        return NextResponse.json({ error: "This admin is not a Super Admin." }, { status: 400 });
      }
      if (target.id === session.userId) {
        return NextResponse.json({ error: "You cannot change your own role." }, { status: 400 });
      }
      const remaining = await countActiveSuperAdmins(target.id);
      if (remaining === 0) {
        return NextResponse.json({ error: "Cannot demote the last active Super Admin." }, { status: 400 });
      }
      const updated = await prisma.user.update({ where: { id }, data: { role: "wgc_admin" } });
      await prisma.auditLog.create({
        data: { action: "ADMIN_ROLE_CHANGED", actorEmail: session.email, metadata: { targetUserId: id, newRole: "wgc_admin" } },
      });
      return NextResponse.json({ admin: { id: updated.id, role: updated.role } });
    }

    case "resend-invite": {
      if (target.passwordHash) {
        return NextResponse.json({ error: "This admin has already accepted their invitation." }, { status: 400 });
      }
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 48);

      await prisma.user.update({
        where: { id },
        data: { setPasswordTokenHash: tokenHash, setPasswordTokenExpiresAt: expiresAt },
      });

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://wgcpayments.com";
      const inviteLink = `${appUrl}/admin/accept-invite?token=${rawToken}`;
      try {
        await sendWgcEmail({
          to: target.email,
          subject: "Your WGC Payments Admin Dashboard invitation",
          title: "You're invited",
          badgeText: "Admin Invitation",
          badgeColor: "#0B5DBC",
          bodyHtml: `<p>Here's a fresh invitation link to join the WGC Payments Admin Dashboard.</p>
                     <p><a href="${inviteLink}">Accept invitation and set your password</a></p>
                     <p>This invitation link expires in 48 hours.</p>`,
        });
      } catch (err) {
        console.error("Failed to resend admin invite email:", err);
      }

      await prisma.auditLog.create({
        data: { action: "ADMIN_INVITE_RESENT", actorEmail: session.email, metadata: { targetUserId: id } },
      });
      return NextResponse.json({ success: true });
    }

    case "revoke-invite": {
      if (target.passwordHash) {
        return NextResponse.json({ error: "This admin has already accepted their invitation." }, { status: 400 });
      }
      await prisma.user.update({
        where: { id },
        data: { setPasswordTokenHash: null, setPasswordTokenExpiresAt: null },
      });
      await prisma.auditLog.create({
        data: { action: "ADMIN_INVITE_REVOKED", actorEmail: session.email, metadata: { targetUserId: id } },
      });
      return NextResponse.json({ success: true });
    }

    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
}
