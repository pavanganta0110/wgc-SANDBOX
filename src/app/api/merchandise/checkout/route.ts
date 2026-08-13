import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processCombinedCheckout, CheckoutValidationError } from "@/lib/integrations/printful/checkoutService";
import { toSafeMerchandiseErrorMessage } from "@/lib/integrations/printful/errors";

/**
 * Public — the ONLY route a donor's browser calls when their cart has
 * merchandise in it (donation-only submissions on a merchandise-enabled
 * page still go through here so donation + $0 cart share one code path;
 * see CheckoutValidationError below for the "need something" guard). A
 * giving page with merchandiseEnabled=false never calls this endpoint at
 * all — it keeps using /api/g/[slug]/donate exactly as before (spec item
 * 1's backwards-compatibility requirement).
 */
export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { slug, clientAttemptId, donationAmountCents, cartItems, shippingOptionId, address, donor, paymentInstrumentId, token, fraudSessionId, isAnonymous } = body;

  if (!slug || !clientAttemptId || !donor?.name || !donor?.email || !fraudSessionId) {
    return NextResponse.json({ success: false, error: "Missing required fields." }, { status: 400 });
  }

  const link = await prisma.givingLink.findUnique({ where: { publicSlug: slug } });
  if (!link) return NextResponse.json({ success: false, error: "This giving link could not be found." }, { status: 404 });

  try {
    const checkout = await processCombinedCheckout({
      churchId: link.churchId,
      givingLinkId: link.id,
      clientAttemptId,
      donationAmountCents: Number(donationAmountCents) || 0,
      cartItems: Array.isArray(cartItems) ? cartItems : [],
      shippingOptionId: shippingOptionId ?? null,
      address: address ?? null,
      donor,
      paymentInstrumentId,
      token,
      fraudSessionId,
      isAnonymous: Boolean(isAnonymous),
    });

    return NextResponse.json({
      success: true,
      checkoutId: checkout.id,
      finixTransferId: checkout.finixTransferId,
      donationAmount: checkout.donationAmount,
      merchandiseAmount: checkout.merchandiseAmount,
      shippingAmount: checkout.shippingAmount,
      taxAmount: checkout.taxAmount,
      grandTotal: checkout.grandTotal,
      merchandiseOrderId: checkout.merchandiseOrderId,
    });
  } catch (err) {
    console.error("Merchandise checkout failed:", err);
    const message = err instanceof CheckoutValidationError ? err.message : toSafeMerchandiseErrorMessage(err);
    return NextResponse.json({ success: false, error: message }, { status: 402 });
  }
}
