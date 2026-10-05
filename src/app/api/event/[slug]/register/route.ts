import { NextResponse } from "next/server";
import { checkDonationRateLimit } from "@/lib/giving/donationRateLimit";
import { submitEventRegistration, type RegistrationInput } from "@/lib/eventRegistration/registrationService";

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

  let body: RegistrationInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
  }

  const result = await submitEventRegistration(slug, body);
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
