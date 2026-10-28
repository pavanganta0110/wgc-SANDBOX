import { NextResponse } from "next/server";
import { checkSetupLinkRateLimit } from "@/lib/subscriptions/setupLinkRateLimit";
import { checkWindowRateLimit } from "@/lib/donorPortal/rateLimit";
import { sendFindMyGivingEmail } from "@/lib/donorPortal/findMyGiving";
import { isValidEmail, normalizeEmail } from "@/lib/donors/donorContact";

const GENERIC_RESPONSE = { message: "If we found giving under that email, we've sent you links to sign in. Check your inbox." };

/**
 * Public "find my giving" on the WGC site. Always answers identically — match,
 * no match or throttled — so it can't be used to learn who gives where. Any
 * result is emailed only to the address that asked.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const normalized = normalizeEmail(email);
  if (!normalized || !isValidEmail(email)) return NextResponse.json(GENERIC_RESPONSE);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (!checkSetupLinkRateLimit(`donor-portal-find:${ip}`)) return NextResponse.json(GENERIC_RESPONSE);
  // At most 3 mails an hour to any one address, however many IPs ask.
  if (!checkWindowRateLimit(`donor-portal-find-email:${normalized}`, 3, 60 * 60 * 1000)) return NextResponse.json(GENERIC_RESPONSE);

  try {
    await sendFindMyGivingEmail(email);
  } catch (err) {
    console.error("find-my-giving failed:", err);
  }
  return NextResponse.json(GENERIC_RESPONSE);
}
