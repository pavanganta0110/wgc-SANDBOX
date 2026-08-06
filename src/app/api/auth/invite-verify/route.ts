import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setSessionCookie } from "@/lib/auth/session";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  try {
    const { code } = await req.json();
    if (!code) {
      return NextResponse.json({ error: "Verification code is required." }, { status: 400 });
    }

    const cookieStore = await cookies();
    const verifyCookieVal = cookieStore.get("wgc_invite_verify")?.value;
    if (!verifyCookieVal) {
      return NextResponse.json({ error: "Verification session expired or invalid. Please try again." }, { status: 400 });
    }

    const verifyData = JSON.parse(verifyCookieVal);

    if (verifyData.code !== code.trim()) {
      return NextResponse.json({ error: "Invalid verification code. Please check your email." }, { status: 400 });
    }

    const invitedUser = await prisma.user.findUnique({
      where: { id: verifyData.invitedUserId },
    });

    if (!invitedUser) {
      return NextResponse.json({ error: "Invited user account not found." }, { status: 404 });
    }

    // Connect provider account to the invited user record
    await prisma.user.update({
      where: { id: invitedUser.id },
      data: {
        setPasswordTokenHash: null,
        setPasswordTokenExpiresAt: null,
        lastLoginAt: new Date(),
      },
    });

    await prisma.authAccount.upsert({
      where: {
        provider_providerAccountId: {
          provider: verifyData.provider,
          providerAccountId: verifyData.providerAccountId,
        },
      },
      create: {
        userId: invitedUser.id,
        provider: verifyData.provider,
        providerAccountId: verifyData.providerAccountId,
        providerEmail: verifyData.providerEmail,
        lastLoginAt: new Date(),
      },
      update: {
        userId: invitedUser.id,
        providerEmail: verifyData.providerEmail,
        lastLoginAt: new Date(),
      },
    });

    // Send notification
    if (invitedUser.invitedByUserId && invitedUser.churchId) {
      const { notifyEvent } = await import("@/lib/settings/notificationDispatch");
      await notifyEvent({
        churchId: invitedUser.churchId,
        eventKey: "TEAM_INVITE_ACCEPTED",
        subject: "Team invitation accepted",
        title: "Team Invitation Accepted",
        badgeText: "Team Update",
        badgeColor: "#0B5DBC",
        bodyHtml: `<p><strong>${invitedUser.email}</strong> has accepted their invitation via verified social login.</p>`,
      });
    }

    // Clear verification session
    cookieStore.delete("wgc_invite_verify");

    // Establish session
    await setSessionCookie({
      userId: invitedUser.id,
      email: invitedUser.email,
      role: invitedUser.role as any,
      churchId: invitedUser.churchId,
      authVersion: invitedUser.authVersion,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Invite code verification failed:", err);
    return NextResponse.json({ error: "An internal error occurred during verification." }, { status: 500 });
  }
}
