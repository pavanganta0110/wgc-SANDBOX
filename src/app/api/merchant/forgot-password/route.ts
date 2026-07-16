import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { sendWgcEmail } from "@/lib/email";

const GENERIC_MESSAGE =
  "If an account exists for that email, we've sent a link to reset your password.";

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    // Always respond the same way whether or not the account exists, so
    // this endpoint can't be used to enumerate registered emails.
    if (!user || user.role !== "church_admin") {
      return NextResponse.json({ success: true, message: GENERIC_MESSAGE });
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 1);

    await prisma.user.update({
      where: { id: user.id },
      data: { setPasswordTokenHash: tokenHash, setPasswordTokenExpiresAt: expiresAt },
    });

    // Always use the canonical app URL — never trust the Origin request header
    // (an attacker could send Origin: https://evil.com to craft a phishing link).
    let appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl && process.env.VERCEL_URL) {
      appUrl = `https://${process.env.VERCEL_URL}`;
    }
    appUrl = appUrl || "http://localhost:3000";
    const resetLink = `${appUrl}/merchant/set-password/${rawToken}`;

    await sendWgcEmail({
      to: user.email,
      subject: "Reset your WGC Payments password",
      title: "Reset your password",
      badgeText: "Action Required",
      badgeColor: "#0B5DBC",
      bodyHtml: `<p>We received a request to reset your WGC Payments dashboard password.</p>
                 <p><a href="${resetLink}">Set a new password</a></p>
                 <p>This link expires in 24 hours. If you didn't request this, you can safely ignore this email.</p>`,
    });

    return NextResponse.json({ success: true, message: GENERIC_MESSAGE });
  } catch (error) {
    console.error("Forgot password request failed:", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
