import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { checkMerchantAuthRateLimit } from "@/lib/auth/merchantAuthRateLimit";
import { verifyPartnerLogin } from "@/lib/partners/partnerAccounts";
import { setPartnerSessionCookie } from "@/lib/partners/partnerSession";
import { isPartnerMfaDisabled, maskEmail, startPartnerMfa } from "@/lib/partners/partnerMfa";
import { createAuditLog } from "@/lib/audit";

/**
 * Step one of a partner sign-in: email and password. When they are right, a 6-digit code is
 * emailed and the browser gets an opaque challenge id to send back with the code
 * (/api/partner/login/verify). No session exists until that second step succeeds.
 */
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

    if (isPartnerMfaDisabled()) {
      await setPartnerSessionCookie(user);
      await prisma.partnerUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      await createAuditLog({ action: "PARTNER_LOGIN_SUCCEEDED", actorEmail: user.email, ipAddress: ip, userAgent, metadata: { partnerId: user.partnerId, mfa: "disabled-for-development" } });
      return NextResponse.json({ success: true });
    }

    const { challengeId, sent } = await startPartnerMfa(user);
    if (!sent) {
      await createAuditLog({ action: "PARTNER_MFA_SEND_FAILED", actorEmail: user.email, ipAddress: ip, userAgent, metadata: { partnerId: user.partnerId } });
      return NextResponse.json({ error: "We couldn't send your sign-in code. Please try again in a moment." }, { status: 502 });
    }
    await createAuditLog({ action: "PARTNER_MFA_CODE_SENT", actorEmail: user.email, ipAddress: ip, userAgent, metadata: { partnerId: user.partnerId } });
    return NextResponse.json({ mfaRequired: true, challengeId, maskedEmail: maskEmail(user.email) });
  } catch (error) {
    console.error("Partner login failed:", error);
    return NextResponse.json({ error: "Login failed. Please try again." }, { status: 500 });
  }
}
