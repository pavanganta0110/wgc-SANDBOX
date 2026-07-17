import { NextResponse } from "next/server";
import { headers } from "next/headers";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { sendWgcEmail } from "@/lib/email";
import { checkAdminAuthRateLimit } from "@/lib/auth/adminAuthRateLimit";

const GENERIC_MESSAGE = "If an account exists for this email, password-reset instructions have been sent.";

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    const headerList = await headers();
    const ip = headerList.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
    if (!checkAdminAuthRateLimit(`admin-forgot-password:${ip}`)) {
      return NextResponse.json({ error: "Too many attempts. Please try again in a minute." }, { status: 429 });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    // Always respond the same way whether or not the account exists, so
    // this endpoint can't be used to enumerate admin emails.
    if (!user || (user.role !== "wgc_admin" && user.role !== "wgc_super_admin") || user.disabledAt) {
      return NextResponse.json({ success: true, message: GENERIC_MESSAGE });
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 45 * 60 * 1000); // 45 minutes

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { setPasswordTokenHash: tokenHash, setPasswordTokenExpiresAt: expiresAt },
      }),
      prisma.auditLog.create({
        data: { action: "PASSWORD_RESET_REQUESTED", actorEmail: user.email, ipAddress: ip, userAgent: headerList.get("user-agent") },
      }),
    ]);

    // Always use the canonical app URL — never trust a request header,
    // which could be spoofed to construct a phishing link.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://wgcpayments.com";
    const resetLink = `${appUrl}/admin/reset-password?token=${rawToken}`;

    await sendWgcEmail({
      to: user.email,
      subject: "Reset your WGC Payments admin password",
      title: "Reset your password",
      badgeText: "Action Required",
      badgeColor: "#0B5DBC",
      bodyHtml: `<p>Hi${user.name ? ` ${user.name}` : ""},</p>
                 <p>We received a request to reset your WGC Payments admin dashboard password.</p>
                 <p><a href="${resetLink}">Set a new password</a></p>
                 <p>This link expires in 45 minutes. If you didn't request this, you can safely ignore this email — your password will not be changed.</p>`,
    });

    return NextResponse.json({ success: true, message: GENERIC_MESSAGE });
  } catch (error) {
    console.error("Admin forgot password request failed:", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
