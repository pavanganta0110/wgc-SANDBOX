import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { checkMerchantAuthRateLimit } from "@/lib/auth/merchantAuthRateLimit";
import { resendPartnerMfa } from "@/lib/partners/partnerMfa";

/** A new sign-in code for an open sign-in, no more often than every 30 seconds. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const challengeId = typeof body.challengeId === "string" ? body.challengeId : "";

  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (!checkMerchantAuthRateLimit(`partner-mfa-resend:ip:${ip}`)) {
    return NextResponse.json({ error: "Too many attempts. Please try again in a minute." }, { status: 429 });
  }

  const result = await resendPartnerMfa(challengeId);
  if (result.ok) return NextResponse.json({ success: true });
  if (result.reason === "too_soon") return NextResponse.json({ error: "Please wait a moment before asking for another code." }, { status: 429 });
  if (result.reason === "send_failed") return NextResponse.json({ error: "We couldn't send the code. Please try again." }, { status: 502 });
  return NextResponse.json({ error: "That sign-in has expired. Please start again." }, { status: 400 });
}
