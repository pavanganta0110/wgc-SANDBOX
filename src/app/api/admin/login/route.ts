import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { setSessionCookie } from "@/lib/auth/session";
import { checkAdminAuthRateLimit } from "@/lib/auth/adminAuthRateLimit";

const GENERIC_ERROR = "Unable to sign in with those credentials.";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
    }

    const headerList = await headers();
    const ip = headerList.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
    if (!checkAdminAuthRateLimit(`admin-login:${ip}`)) {
      return NextResponse.json({ error: "Too many attempts. Please try again in a minute." }, { status: 429 });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    const logFailure = () =>
      prisma.auditLog.create({
        data: { action: "LOGIN_FAILED", actorEmail: normalizedEmail, ipAddress: ip, userAgent: headerList.get("user-agent") },
      });

    // Same generic error for every failure mode — never reveals whether
    // the email exists, whether it's an admin account, or whether it's
    // disabled.
    if (!user || (user.role !== "wgc_admin" && user.role !== "wgc_super_admin") || !user.passwordHash || user.disabledAt) {
      await logFailure();
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      await logFailure();
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    await setSessionCookie({
      userId: user.id,
      email: user.email,
      role: user.role as "wgc_super_admin" | "wgc_admin",
      churchId: null,
      passwordChangedAt: user.passwordChangedAt ? user.passwordChangedAt.getTime() : null,
    });

    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
      prisma.auditLog.create({
        data: { action: "LOGIN_SUCCEEDED", actorEmail: user.email, ipAddress: ip, userAgent: headerList.get("user-agent") },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Admin login failed:", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
