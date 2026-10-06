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
  const method = METHODS.find((m) => m === body.paymentMethod);
  if (!method) return NextResponse.json({ error: "Choose cash, check or complimentary." }, { status: 400 });

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
    { userId: auth.userId, paymentMethod: method }
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({
    success: true,
    registrationId: result.registrationId,
    confirmationCode: result.confirmationCode,
    totalCents: result.totals.totalCents,
    attendeeCount: result.totals.attendeeCount,
  });
}
