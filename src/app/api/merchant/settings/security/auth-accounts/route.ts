import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, type SessionPayload } from "@/lib/auth/session";

// GET: retrieve login methods and recent activity
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { passwordHash: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const accounts = await prisma.authAccount.findMany({
      where: { userId: session.userId },
      select: { provider: true, createdAt: true, lastLoginAt: true },
    });

    const recentActivity = await prisma.dashboardAuditLog.findMany({
      where: { actorUserId: session.userId, action: { startsWith: "auth." } },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    return NextResponse.json({
      connectedProviders: accounts.map((a) => a.provider),
      hasPassword: user.passwordHash !== null,
      recentActivity,
      recentAuthTime: session.authTime || null,
    });
  } catch (err) {
    console.error("Failed to fetch auth accounts info:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE: disconnect Google or Apple account
export async function DELETE(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { provider } = await req.json();
    if (provider !== "google" && provider !== "apple") {
      return NextResponse.json({ error: "Invalid provider specified" }, { status: 400 });
    }

    // 1. Reauthentication Gate
    const now = Math.floor(Date.now() / 1000);
    if (!session.authTime || now - session.authTime > 600) {
      return NextResponse.json({ error: "Reauthentication required", reauthRequired: true }, { status: 403 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { passwordHash: true, role: true, email: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // 2. Last Login Method check
    const connectedCount = await prisma.authAccount.count({
      where: { userId: session.userId },
    });
    const hasPassword = user.passwordHash !== null;
    const totalMethods = connectedCount + (hasPassword ? 1 : 0);

    if (totalMethods <= 1) {
      return NextResponse.json({ error: "Cannot remove the last available login method. Add another login method first." }, { status: 400 });
    }

    // 3. Disconnect provider
    const deleted = await prisma.authAccount.deleteMany({
      where: { userId: session.userId, provider },
    });

    if (deleted.count > 0) {
      // 4. Log Audit Event
      if (session.churchId) {
        await prisma.dashboardAuditLog.create({
          data: {
            churchId: session.churchId,
            actorUserId: session.userId,
            actorEmail: session.email,
            actorRole: session.role,
            action: `auth.${provider}_disconnected`,
            metadata: { provider },
            createdAt: new Date(),
          },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to disconnect provider:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
