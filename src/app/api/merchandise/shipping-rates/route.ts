import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { priceCartServerSide, getShippingQuote } from "@/lib/integrations/printful/orderService";
import { toSafeMerchandiseErrorMessage } from "@/lib/integrations/printful/errors";

/**
 * Public — spec item 33. Never hard-codes shipping in the UI; the donor
 * giving page always calls this to get real (mock, for now) options.
 */
export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { slug, items, address } = body;
  if (typeof slug !== "string" || !Array.isArray(items) || !address) {
    return NextResponse.json({ error: "Missing slug, items, or address." }, { status: 400 });
  }

  const link = await prisma.givingLink.findUnique({ where: { publicSlug: slug } });
  if (!link || !link.merchandiseEnabled) {
    return NextResponse.json({ error: "Merchandise is not available on this giving page." }, { status: 400 });
  }

  try {
    const pricedCart = await priceCartServerSide({ churchId: link.churchId, givingPageId: link.id, items });
    const quote = await getShippingQuote({ churchId: link.churchId, address, items, pricedCart });
    return NextResponse.json({ options: quote.options });
  } catch (err) {
    console.error("Shipping rate calculation failed:", err);
    return NextResponse.json({ error: toSafeMerchandiseErrorMessage(err) }, { status: 400 });
  }
}
