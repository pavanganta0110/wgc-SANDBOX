import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { setSessionCookie, type SessionPayload } from "@/lib/auth/session";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !user.passwordHash) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    // Team-access Checkpoint 1: previously missing entirely — a disabled
    // user's password still worked, they just happened to fail every
    // permission check post-login. Reject at the door instead.
    if (user.disabledAt) {
      return NextResponse.json({ error: "This account has been disabled." }, { status: 403 });
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    await setSessionCookie({
      userId: user.id,
      email: user.email,
      role: user.role as SessionPayload["role"],
      churchId: user.churchId,
      authVersion: user.authVersion,
    });

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    // Handle account linking if a pending link cookie is present
    const cookieStore = await cookies();
    const pendingLinkCookie = cookieStore.get("wgc_pending_link")?.value;
    if (pendingLinkCookie) {
      try {
        const pendingLink = JSON.parse(pendingLinkCookie);
        if (pendingLink.email === user.email) {
          // Link provider account
          await prisma.authAccount.upsert({
            where: { provider_providerAccountId: { provider: pendingLink.provider, providerAccountId: pendingLink.providerAccountId } },
            create: {
              userId: user.id,
              provider: pendingLink.provider,
              providerAccountId: pendingLink.providerAccountId,
              providerEmail: pendingLink.providerEmail,
              lastLoginAt: new Date(),
            },
            update: {
              userId: user.id,
              providerEmail: pendingLink.providerEmail,
              lastLoginAt: new Date(),
            },
          });

          // Log Audit event
          if (user.churchId) {
            await prisma.dashboardAuditLog.create({
              data: {
                churchId: user.churchId,
                actorUserId: user.id,
                actorEmail: user.email,
                actorRole: user.role,
                action: `auth.${pendingLink.provider}_account_linked`,
                metadata: { provider: pendingLink.provider, providerEmail: pendingLink.providerEmail },
                createdAt: new Date(),
              },
            });
          } else {
            await prisma.auditLog.create({
              data: {
                action: `auth.${pendingLink.provider}_account_linked`,
                actorEmail: user.email,
                metadata: { provider: pendingLink.provider, providerEmail: pendingLink.providerEmail },
                createdAt: new Date(),
              },
            });
          }

          cookieStore.delete("wgc_pending_link");
        }
      } catch (err) {
        console.error("Account linking failed during login:", err);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Church login failed:", error);
    return NextResponse.json({ error: "Login failed. Please try again." }, { status: 500 });
  }
}
