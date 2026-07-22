import { getAdminSession } from "@/lib/auth/session";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { notifyAdminSupportChange } from "@/lib/support/ticketNotifications";

export async function POST(req: Request) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { userId, churchId, actionType, reason, ticketId, ticketNumber, ...extraData } = await req.json();

    if (!userId || !churchId || !actionType) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    if (!reason || typeof reason !== "string" || reason.trim() === "") {
      return NextResponse.json({ error: "Reason is required" }, { status: 400 });
    }

    const adminUser = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { permissionsJson: true },
    });
    
    const permissions = adminUser?.permissionsJson as Record<string, boolean> | null;
    const canManageSupport = session.role === "wgc_super_admin" || (session.role === "wgc_admin" && permissions?.canManageUsers === true);
    if (!canManageSupport) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId, churchId },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    
    const church = await prisma.church.findUnique({
      where: { id: churchId },
      select: { name: true },
    });

    const adminEmail = session.email;

    switch (actionType) {
      case "RESEND_INVITE":
      case "RESEND_PASSWORD_RESET": {
        const token = crypto.randomBytes(32).toString("hex");
        const hash = crypto.createHash("sha256").update(token).digest("hex");
        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        await prisma.user.update({
          where: { id: userId },
          data: {
            setPasswordTokenHash: hash,
            setPasswordTokenExpiresAt: expires,
          },
        });

        // In a real app, send an email here using the `token`.
        // For the sandbox, we'll just log it or rely on existing email utils if available.
        console.log(
          `[Support Action] Generated new token for ${user.email}: ${token}`,
        );

        await prisma.auditLog.create({
          data: {
            action:
              actionType === "RESEND_INVITE"
                ? "USER_INVITE_RESENT"
                : "USER_PASSWORD_RESET_RESENT",
            actorEmail: adminEmail,
            metadata: { userId, churchId, reason, ticketId },
          },
        });

        await notifyAdminSupportChange({
          affectedUserEmail: user.email,
          affectedUserName: user.name || "Unknown",
          churchName: church?.name || "your organization",
          changeDescription: actionType === "RESEND_INVITE" ? "Resend Invitation" : "Resend Password Reset",
          reason,
          ticketNumber
        });

        return NextResponse.json({ message: "Email triggered successfully" });
      }

      case "REVOKE_SESSIONS": {
        await prisma.user.update({
          where: { id: userId },
          data: {
            authVersion: { increment: 1 },
          },
        });

        await prisma.auditLog.create({
          data: {
            action: "USER_SESSIONS_REVOKED",
            actorEmail: adminEmail,
            metadata: { userId, churchId, reason, ticketId },
          },
        });

        await notifyAdminSupportChange({
          affectedUserEmail: user.email,
          affectedUserName: user.name || "Unknown",
          churchName: church?.name || "your organization",
          changeDescription: "Revoke Sessions",
          reason,
          ticketNumber
        });

        return NextResponse.json({ message: "All active sessions revoked" });
      }

      case "CORRECT_PROFILE": {
        const { name, email } = extraData;
        if (!email) {
          return NextResponse.json(
            { error: "Email is required" },
            { status: 400 },
          );
        }

        await prisma.user.update({
          where: { id: userId },
          data: { name, email },
        });

        await prisma.auditLog.create({
          data: {
            action: "USER_PROFILE_CORRECTED",
            actorEmail: adminEmail,
            metadata: {
              userId,
              churchId,
              reason,
              ticketId,
              oldEmail: user.email,
              newEmail: email,
              oldName: user.name,
              newName: name,
            },
          },
        });

        await notifyAdminSupportChange({
          affectedUserEmail: email, // Send to new email
          affectedUserName: name || user.name || "Unknown",
          churchName: church?.name || "your organization",
          changeDescription: "Correct Profile",
          reason,
          ticketNumber
        });

        return NextResponse.json({ message: "Profile updated successfully" });
      }

      case "DISABLE": {
        await prisma.user.update({
          where: { id: userId },
          data: {
            disabledAt: new Date(),
            disabledByUserId: "wgc_support", // Or map to admin user ID if available
            authVersion: { increment: 1 }, // also revoke sessions
          },
        });

        await prisma.auditLog.create({
          data: {
            action: "USER_DISABLED",
            actorEmail: adminEmail,
            metadata: { userId, churchId, reason, ticketId },
          },
        });

        await notifyAdminSupportChange({
          affectedUserEmail: user.email,
          affectedUserName: user.name || "Unknown",
          churchName: church?.name || "your organization",
          changeDescription: "Disable Account",
          reason,
          ticketNumber
        });

        return NextResponse.json({ message: "User disabled" });
      }

      case "REACTIVATE": {
        await prisma.user.update({
          where: { id: userId },
          data: {
            disabledAt: null,
            disabledByUserId: null,
          },
        });

        await prisma.auditLog.create({
          data: {
            action: "USER_REACTIVATED",
            actorEmail: adminEmail,
            metadata: { userId, churchId, reason, ticketId },
          },
        });

        await notifyAdminSupportChange({
          affectedUserEmail: user.email,
          affectedUserName: user.name || "Unknown",
          churchName: church?.name || "your organization",
          changeDescription: "Reactivate Account",
          reason,
          ticketNumber
        });

        return NextResponse.json({ message: "User reactivated" });
      }

      case "UNLOCK": {
        // Unlock typically means clearing failed login attempts,
        // but since we only have `disabledAt` in this schema, we'll clear it.
        // It might be conceptually similar to reactivate but without a reason.
        await prisma.user.update({
          where: { id: userId },
          data: {
            disabledAt: null,
            disabledByUserId: null,
          },
        });

        await prisma.auditLog.create({
          data: {
            action: "USER_UNLOCKED",
            actorEmail: adminEmail,
            metadata: { userId, churchId, reason, ticketId },
          },
        });

        await notifyAdminSupportChange({
          affectedUserEmail: user.email,
          affectedUserName: user.name || "Unknown",
          churchName: church?.name || "your organization",
          changeDescription: "Unlock Account",
          reason,
          ticketNumber
        });

        return NextResponse.json({ message: "User unlocked" });
      }

      default:
        return NextResponse.json(
          { error: "Invalid action type" },
          { status: 400 },
        );
    }
  } catch (error: any) {
    console.error("User Support Action Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
