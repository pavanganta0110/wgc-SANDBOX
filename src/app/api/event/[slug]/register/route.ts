import { NextResponse } from "next/server";
import { checkDonationRateLimit } from "@/lib/giving/donationRateLimit";
import { submitEventRegistration, type RegistrationInput, type DoorSaleOptions } from "@/lib/eventRegistration/registrationService";
import { guardEventsRoute } from "@/lib/eventRegistration/merchantGuard";
import { prisma } from "@/lib/prisma";

/**
 * Public, unauthenticated registration endpoint. Everything that matters
 * (church, price, add-on prices, totals, limits) is resolved server-side
 * from the event slug — the body only carries the registrant's own answers.
 * A free total confirms the registration right here with no Finix call; a
 * paid total returns PENDING plus the event's dedicated giving-link slug,
 * and the client then pays through the ordinary /api/g/[slug]/donate flow
 * tagged with the returned registrationId.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (!checkDonationRateLimit(`event-register:${ip}:${slug}`)) {
    return NextResponse.json({ success: false, error: "Too many attempts. Please wait a moment and try again." }, { status: 429 });
  }

  let body: RegistrationInput & { doorSale?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
  }

  // A door CARD sale: the same public checkout, driven by signed-in staff
  // on their own device. The flag is honoured only for a session that can
  // manage attendees AND belongs to the church that owns this event —
  // anyone else sending it is simply refused.
  let door: DoorSaleOptions | undefined;
  if (body?.doorSale === true) {
    const guard = await guardEventsRoute("canManageEventAttendees");
    if ("response" in guard) return guard.response;
    const event = await prisma.event.findUnique({ where: { slug }, select: { churchId: true } });
    if (!event || event.churchId !== guard.auth.churchId) {
      return NextResponse.json({ success: false, error: "This event could not be found." }, { status: 404 });
    }
    door = { userId: guard.auth.userId };
  }

  const result = await submitEventRegistration(slug, body, new Date(), door);
  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: result.status });
  }
  return NextResponse.json({
    success: true,
    duplicate: result.duplicate,
    registrationId: result.registrationId,
    confirmationCode: result.confirmationCode,
    status: result.status,
    requiresPayment: result.requiresPayment,
    totalCents: result.totals.totalCents,
    givingLinkSlug: result.givingLinkSlug,
  });
}
