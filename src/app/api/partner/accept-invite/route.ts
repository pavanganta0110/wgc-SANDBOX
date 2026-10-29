import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { checkMerchantAuthRateLimit } from "@/lib/auth/merchantAuthRateLimit";
import { acceptPartnerInvite, PartnerAccountError } from "@/lib/partners/partnerAccounts";
import { setPartnerSessionCookie } from "@/lib/partners/partnerSession";
import { createAuditLog } from "@/lib/audit";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = typeof body.token === "string" ? body.token : "";
    const password = typeof body.password === "string" ? body.password : "";

    const headerList = await headers();
    const ip = headerList.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
    if (!checkMerchantAuthRateLimit(`partner-accept:ip:${ip}`)) {
      return NextResponse.json({ error: "Too many attempts. Please try again in a minute." }, { status: 429 });
    }

    const user = await acceptPartnerInvite(token, password);
    await setPartnerSessionCookie(user);
    await createAuditLog({
      action: "PARTNER_INVITE_ACCEPTED",
      actorEmail: user.email,
      ipAddress: ip,
      userAgent: headerList.get("user-agent") || undefined,
      metadata: { partnerId: user.partnerId },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof PartnerAccountError) {
      const status = error.code === "disabled" ? 403 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    console.error("Partner invite acceptance failed:", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
