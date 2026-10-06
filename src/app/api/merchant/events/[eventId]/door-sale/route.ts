import { NextResponse } from "next/server";
import crypto from "crypto";
import { guardEventsRoute, loadOwnedEvent, notFoundResponse } from "@/lib/eventRegistration/merchantGuard";
import { submitEventRegistration, type DoorPaymentMethod, type RegistrationInput } from "@/lib/eventRegistration/registrationService";

type Ctx = { params: Promise<{ eventId: string }> };

const METHODS: DoorPaymentMethod[] = ["CASH", "CHECK", "COMPLIMENTARY"];

/**
 * Cash / check / comp ticket sold by staff at the door. The price is always
 * recomputed server-side from the event's configuration (the body never
 * carries an amount), the registration is confirmed immediately, the
 * attendees are checked in, and the ticket is emailed. No Finix call and no
 * Payment row — the money is in the merchant's hand, so it's recorded on the
 * registration and reported separately from online revenue.
 *
 * Card sales do NOT come through here: they use the public checkout in
 * door mode so they go through the normal, reconciled Finix flow.
 */
export async function POST(req: Request, { params }: Ctx) {
  const guard = await guardEventsRoute("canManageEventAttendees");
  if ("response" in guard) return guard.response;
  const { auth } = guard;
  const { eventId } = await params;

  const event = await loadOwnedEvent(auth.churchId, eventId);
  if (!event || event.archivedAt) return notFoundResponse();

  const body = (await req.json().catch(() => null)) as (Partial<RegistrationInput> & { paymentMethod?: string }) | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  // CARD creates the pending registration only; the buyer then pays on the
  // door-pay page through the normal Finix checkout.
  const isCard = body.paymentMethod === "CARD";
  const method = METHODS.find((m) => m === body.paymentMethod);
  if (!method && !isCard) return NextResponse.json({ error: "Choose cash, check, card or complimentary." }, { status: 400 });

  const result = await submitEventRegistration(
    event.slug,
    {
      clientKey: typeof body.clientKey === "string" && body.clientKey ? body.clientKey : `door-${crypto.randomUUID()}`,
      registrant: body.registrant as RegistrationInput["registrant"],
      attendees: body.attendees as RegistrationInput["attendees"],
      groupName: body.groupName,
      customResponses: body.customResponses,
      addOns: body.addOns,
      // A door sale is the ticket only — no optional extra gift is collected in cash here.
      donationCents: 0,
    },
    new Date(),
    { userId: auth.userId, ...(method ? { paymentMethod: method } : {}) }
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  if (isCard) {
    if (!result.requiresPayment) {
      // Nothing to charge (a $0 total) — it's already confirmed and checked in.
      return NextResponse.json({ success: true, registrationId: result.registrationId, confirmationCode: result.confirmationCode, totalCents: 0, attendeeCount: result.totals.attendeeCount });
    }
    return NextResponse.json({
      success: true,
      payUrl: `/event/${encodeURIComponent(event.slug)}/door-pay/${result.registrationId}`,
      registrationId: result.registrationId,
      confirmationCode: result.confirmationCode,
      totalCents: result.totals.totalCents,
      attendeeCount: result.totals.attendeeCount,
    });
  }

  return NextResponse.json({
    success: true,
    registrationId: result.registrationId,
    confirmationCode: result.confirmationCode,
    totalCents: result.totals.totalCents,
    attendeeCount: result.totals.attendeeCount,
  });
}
