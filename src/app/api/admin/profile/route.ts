import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession, setSessionCookie } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, name: true, role: true, lastLoginAt: true, createdAt: true },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ user });
}

export async function PATCH(req: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { name, currentPassword, newPassword, logoutAllSessions } = body;

  if (logoutAllSessions === true) {
    await prisma.user.update({
      where: { id: session.userId },
      data: { passwordChangedAt: new Date() },
    });
    await prisma.auditLog.create({
      data: {
        action: "ADMIN_LOGOUT_ALL_SESSIONS",
        actorEmail: session.email,
        metadata: { userId: session.userId },
      },
    });
    return NextResponse.json({ success: true, loggedOutAllSessions: true });
  }

  const updates: Record<string, unknown> = {};

  if (typeof name === "string") {
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > 200) {
      return NextResponse.json({ error: "Please provide a valid name." }, { status: 400 });
    }
    updates.name = trimmed;
  }

  let passwordChangedAt: Date | null = null;

  if (typeof newPassword === "string" && newPassword.length > 0) {
    if (typeof currentPassword !== "string" || currentPassword.length === 0) {
      return NextResponse.json({ error: "Current password is required to set a new password." }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ error: "New password must be at least 8 characters." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user || !user.passwordHash) {
      return NextResponse.json({ error: "Unable to update password." }, { status: 400 });
    }

    const valid = await verifyPassword(currentPassword, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
    }

    passwordChangedAt = new Date();
    updates.passwordHash = await hashPassword(newPassword);
    updates.passwordChangedAt = passwordChangedAt;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: session.userId },
    data: updates,
    select: { id: true, email: true, name: true, role: true },
  });

  await prisma.auditLog.create({
    data: {
      action: passwordChangedAt ? "ADMIN_PASSWORD_CHANGED" : "ADMIN_PROFILE_UPDATED",
      actorEmail: session.email,
      metadata: { userId: session.userId },
    },
  });

  // Re-issue the session cookie so this admin's own session keeps working
  // after a password change (passwordChangedAt is compared against the DB
  // on every request — without this the admin would be logged out too).
  if (passwordChangedAt) {
    await setSessionCookie({
      userId: updated.id,
      email: updated.email,
      role: updated.role as "wgc_super_admin" | "wgc_admin" | "church_admin",
      churchId: null,
      passwordChangedAt: passwordChangedAt.getTime(),
    });
  }

  return NextResponse.json({ user: updated });
}
