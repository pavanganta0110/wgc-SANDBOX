import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { setSessionCookie, type SessionPayload } from "@/lib/auth/session";

export async function POST(req: Request) {
  try {
    const { token, password } = await req.json();

    if (!token || !password) {
      return NextResponse.json({ error: "Missing token or password." }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const user = await prisma.user.findFirst({
      where: { setPasswordTokenHash: tokenHash },
    });

    if (!user || !user.setPasswordTokenExpiresAt || user.setPasswordTokenExpiresAt < new Date()) {
      return NextResponse.json(
        { error: "This link is invalid or has expired. Contact WGC Payments Support for a new one." },
        { status: 400 }
      );
    }

    if (user.disabledAt) {
      return NextResponse.json(
        { error: "This account has been disabled. Contact WGC Payments Support." },
        { status: 403 }
      );
    }

    const passwordHash = await hashPassword(password);

    // authVersion is bumped in the same update — this is also the reset
    // path (not just first-time invite setup), and a password reset must
    // kill any other session for this user (e.g. an attacker who stole a
    // cookie and is still using it) exactly like the in-dashboard change-
    // password flow does. The auto-login session below is built from this
    // call's returned (already-incremented) authVersion, not the stale
    // pre-update value, so the fresh session it creates isn't immediately
    // invalidated by the bump that just happened.
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        setPasswordTokenHash: null,
        setPasswordTokenExpiresAt: null,
        lastLoginAt: new Date(),
        authVersion: { increment: 1 },
      },
    });

    // Password is saved and the token is consumed at this point — that's
    // the part that matters. Auto-login is a convenience on top of it, so
    // a failure here (e.g. a session-signing issue) must not turn into an
    // error response that tells the user their password wasn't set when
    // it was — that leaves them with a burned token and no way back in.
    try {
      await setSessionCookie({
        userId: user.id,
        email: user.email,
        role: user.role as SessionPayload["role"],
        churchId: user.churchId,
        authVersion: updatedUser.authVersion,
      });
    } catch (sessionError) {
      console.error("Password set but auto-login session failed:", sessionError);
      return NextResponse.json({ success: true, autoLoginFailed: true });
    }

    if (!user.passwordHash && user.invitedByUserId && user.churchId) {
      const { notifyEvent } = await import("@/lib/settings/notificationDispatch");
      await notifyEvent({
        churchId: user.churchId,
        eventKey: "TEAM_INVITE_ACCEPTED",
        subject: "Team invitation accepted",
        title: "Team Invitation Accepted",
        badgeText: "Team Update",
        badgeColor: "#0B5DBC",
        bodyHtml: `<p><strong>${user.email}</strong> has accepted their invitation and set up their Organization Admin account.</p>`,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Set password failed:", error);
    return NextResponse.json({ error: "Failed to set password. Please try again." }, { status: 500 });
  }
}
