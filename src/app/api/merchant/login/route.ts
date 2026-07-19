import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { setSessionCookie, type SessionPayload } from "@/lib/auth/session";

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

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Church login failed:", error);
    return NextResponse.json({ error: "Login failed. Please try again." }, { status: 500 });
  }
}
