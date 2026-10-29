import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { checkMerchantAuthRateLimit } from "@/lib/auth/merchantAuthRateLimit";
import { verifyPartnerMfa } from "@/lib/partners/partnerMfa";
import { setPartnerSessionCookie } from "@/lib/partners/partnerSession";
import { createAuditLog } from "@/lib/audit";

const MESSAGES = {
  invalid: "That code isn't right. Check it and try again.",
  expired: "That code has expired. Request a new one.",
  locked: "Too many wrong tries. Request a new code.",
} as const;

/** Step two of a partner sign-in: the emailed code. Only here is the session created. */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const challengeId = typeof body.challengeId === "string" ? body.challengeId : "";
    const code = typeof body.code === "string" ? body.code.trim() : "";

    const headerList = await headers();
    const ip = headerList.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
    if (!checkMerchantAuthRateLimit(`partner-mfa:ip:${ip}`)) {
      return NextResponse.json({ error: "Too many attempts. Please try again in a minute." }, { status: 429 });
    }

    const result = await verifyPartnerMfa(challengeId, code);
    if (!result.ok) {
      await createAuditLog({ action: "PARTNER_MFA_FAILED", ipAddress: ip, userAgent: headerList.get("user-agent") || undefined, metadata: { reason: result.reason } });
      return NextResponse.json({ error: MESSAGES[result.reason] }, { status: result.reason === "locked" ? 429 : 401 });
    }

    await setPartnerSessionCookie(result.user);
    await createAuditLog({
      action: "PARTNER_LOGIN_SUCCEEDED",
      actorEmail: result.user.email,
      ipAddress: ip,
      userAgent: headerList.get("user-agent") || undefined,
      metadata: { partnerId: result.user.partnerId, mfa: "email" },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Partner MFA verification failed:", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
