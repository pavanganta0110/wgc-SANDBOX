import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { requirePartnerAdmin } from "@/lib/partners/requirePartnerAdmin";
import { isEmbedSignInMode, type EmbedSignInMode } from "@/lib/partners/embedEntry";

const MAX_PRICE_CENTS = 1_000_000; // $10,000 per merchant per month: a typo guard, not a business rule

/**
 * Partner settings WGC controls: whether WGC emails the partner's organizations about
 * onboarding, and the price the partner pays per approved merchant per month (null stops
 * billing). A price change applies from the next invoice; an invoice already issued never changes.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ partnerId: string }> }) {
  const auth = await requirePartnerAdmin();
  if ("response" in auth) return auth.response;
  const { partnerId } = await params;

  const body = await req.json().catch(() => ({}));
  const data: { suppressMerchantEmails?: boolean; pricePerMerchantCents?: number | null; embedSignInMode?: EmbedSignInMode } = {};

  if ("suppressMerchantEmails" in body) {
    if (typeof body.suppressMerchantEmails !== "boolean") return NextResponse.json({ error: "suppressMerchantEmails must be true or false." }, { status: 400 });
    data.suppressMerchantEmails = body.suppressMerchantEmails;
  }
  if ("embedSignInMode" in body) {
    if (!isEmbedSignInMode(body.embedSignInMode)) return NextResponse.json({ error: "embedSignInMode must be CRM_IDENTITY or PASSCODE." }, { status: 400 });
    data.embedSignInMode = body.embedSignInMode;
  }
  if ("pricePerMerchantCents" in body) {
    const price = body.pricePerMerchantCents;
    if (price !== null && (!Number.isInteger(price) || price < 0 || price > MAX_PRICE_CENTS)) {
      return NextResponse.json({ error: "Price must be a whole number of cents, or empty to stop billing." }, { status: 400 });
    }
    data.pricePerMerchantCents = price === 0 ? null : price;
  }
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

  const result = await prisma.partner.updateMany({ where: { id: partnerId }, data });
  if (result.count !== 1) return NextResponse.json({ error: "Partner not found." }, { status: 404 });
  await createAuditLog({ action: "PARTNER_SETTINGS_CHANGED", actorEmail: auth.session.email, metadata: { partnerId, ...data } });
  return NextResponse.json({ success: true });
}
