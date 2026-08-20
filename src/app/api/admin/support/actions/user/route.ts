import { getAdminSession } from "@/lib/auth/session";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { notifyAdminSupportChange } from "@/lib/support/ticketNotifications";
import { sendWgcEmail } from "@/lib/email";

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
        // Was previously only generating a token and console.logging it —
        // no email was ever actually sent to the user, so this action was
        // a no-op from their perspective despite the admin UI reporting
        // success. Now sends the same real "set your password" link email
        // the merchant's own Team-invite flow and the onboarding
        // DASHBOARD_ACCESS email send, so the recipient can actually use
        // it, not just a generic "something changed" notification.
        const token = crypto.randomBytes(32).toString("hex");
        const hash = crypto.createHash("sha256").update(token).digest("hex");
        const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days, matching every other invite link in this codebase

        await prisma.user.update({
          where: { id: userId },
          data: {
            setPasswordTokenHash: hash,
            setPasswordTokenExpiresAt: expires,
          },
        });

        const setPasswordLink = `${process.env.NEXT_PUBLIC_APP_URL || "https://www.wgcpayments.com"}/merchant/set-password/${token}`;
        const isInvite = actionType === "RESEND_INVITE";
        const emailResult = await sendWgcEmail({
          to: user.email,
          subject: isInvite ? "Your WGC Payments dashboard access" : "Reset your WGC Payments password",
          title: isInvite ? "Set up your dashboard access" : "Reset your password",
          badgeText: "Action Required",
          badgeColor: "#0B5DBC",
          bodyHtml: `<p>Hi ${user.name || church?.name || "there"},</p>
                     <p>${isInvite
                       ? `Your WGC Payments merchant dashboard is ready. Use the secure link below to set your password and log in.`
                       : `Use the secure link below to set a new password for your WGC Payments account.`}</p>
                     <p><a href="${setPasswordLink}">${isInvite ? "Set your password" : "Reset your password"}</a></p>
                     <p>This link expires in 7 days. If it expires, contact WGC Payments Support and we'll send a new one.</p>`,
        });

        await prisma.emailLog.create({
          data: {
            type: "DASHBOARD_ACCESS",
            to: user.email,
            subject: isInvite ? "Your WGC Payments dashboard access" : "Reset your WGC Payments password",
            status: emailResult.success ? "SENT" : "ERROR",
            sentAt: emailResult.success ? new Date() : null,
            error: emailResult.success ? null : String(emailResult.error ?? "unknown error"),
          },
        });

        await prisma.auditLog.create({
          data: {
            action: isInvite ? "USER_INVITE_RESENT" : "USER_PASSWORD_RESET_RESENT",
            actorEmail: adminEmail,
            metadata: { userId, churchId, reason, ticketId, emailSent: emailResult.success },
          },
        });

        if (!emailResult.success) {
          return NextResponse.json({ error: "Failed to send the email. Check the admin Email Logs for details." }, { status: 502 });
        }

        return NextResponse.json({ message: `Invitation email sent to ${user.email}.` });
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
