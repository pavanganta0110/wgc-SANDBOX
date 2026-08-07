import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createPromotionLead, setPromotionLeadCookie } from "@/lib/billing/promotionAttribution";

/**
 * The ONLY server endpoint that creates a Six Months Free PromotionLead —
 * called exclusively by the /six-months-free landing page's "Start Six
 * Months Free" button. Never accepts a promotion code, amount, or duration
 * from the request body; those are fixed by ensureSixMonthsFreePromotion().
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const organizationName = typeof body.organizationName === "string" ? body.organizationName.slice(0, 200) : null;
  const contactName = typeof body.contactName === "string" ? body.contactName.slice(0, 200) : null;
  const contactEmail = typeof body.contactEmail === "string" ? body.contactEmail.slice(0, 320) : null;
  const contactPhone = typeof body.contactPhone === "string" ? body.contactPhone.slice(0, 40) : null;

  const reqHeaders = await headers();
  const ipAddress = reqHeaders.get("x-forwarded-for") || reqHeaders.get("x-real-ip") || null;
  const userAgent = reqHeaders.get("user-agent") || null;

  const { rawToken } = await createPromotionLead({
    organizationName,
    contactName,
    contactEmail,
    contactPhone,
    campaignSource: "six-months-free-landing-page",
    ipAddress,
    userAgent,
  });

  await setPromotionLeadCookie(rawToken);

  return NextResponse.json({ success: true, redirectTo: "/start" });
}
