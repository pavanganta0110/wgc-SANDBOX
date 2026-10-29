import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { checkMerchantAuthRateLimit } from "@/lib/auth/merchantAuthRateLimit";
import { verifyPartnerLogin } from "@/lib/partners/partnerAccounts";
import { setPartnerSessionCookie } from "@/lib/partners/partnerSession";
import { createAuditLog } from "@/lib/audit";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    const headerList = await headers();
    const ip = headerList.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
    const userAgent = headerList.get("user-agent") || undefined;
    // Per address and per email, so one address can't spray many accounts and
    // many addresses can't hammer one account.
    if (!checkMerchantAuthRateLimit(`partner-login:ip:${ip}`) || !checkMerchantAuthRateLimit(`partner-login:email:${email}`)) {
      return NextResponse.json({ error: "Too many attempts. Please try again in a minute." }, { status: 429 });
    }

    const user = await verifyPartnerLogin(email, password);
    if (!user) {
      await createAuditLog({ action: "PARTNER_LOGIN_FAILED", actorEmail: email, ipAddress: ip, userAgent });
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    await setPartnerSessionCookie(user);
    await prisma.partnerUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await createAuditLog({ action: "PARTNER_LOGIN_SUCCEEDED", actorEmail: user.email, ipAddress: ip, userAgent, metadata: { partnerId: user.partnerId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Partner login failed:", error);
    return NextResponse.json({ error: "Login failed. Please try again." }, { status: 500 });
  }
}
