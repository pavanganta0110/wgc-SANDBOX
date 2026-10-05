import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validationError } from "@/lib/utils/validationError";
import { guardEventsRoute, loadOwnedEvent, notFoundResponse } from "@/lib/eventRegistration/merchantGuard";

type Ctx = { params: Promise<{ eventId: string; attendeeId: string }> };

/** Check-in toggle. Body: { checkedIn: boolean }. */
export async function PATCH(req: Request, { params }: Ctx) {
  const guard = await guardEventsRoute("canManageEventAttendees");
  if ("response" in guard) return guard.response;
  const { auth } = guard;
  const { eventId, attendeeId } = await params;

  const event = await loadOwnedEvent(auth.churchId, eventId);
  if (!event) return notFoundResponse();

  const body = await req.json().catch(() => null);
  if (!body || typeof body.checkedIn !== "boolean") return validationError("checkedIn must be true or false.");

  const attendee = await prisma.eventAttendee.findFirst({ where: { id: attendeeId, eventId: event.id, churchId: auth.churchId } });
  if (!attendee) return NextResponse.json({ error: "Attendee not found." }, { status: 404 });

  const registration = await prisma.eventRegistration.findFirst({
    where: { id: attendee.registrationId, churchId: auth.churchId, status: "CONFIRMED" },
    select: { id: true },
  });
  if (!registration) return validationError("Only attendees of confirmed registrations can be checked in.", 409);

  const checkedIn = body.checkedIn as boolean;
  const updated = await prisma.eventAttendee.update({
    where: { id: attendee.id },
    data: checkedIn
      ? { checkedIn: true, checkedInAt: attendee.checkedInAt ?? new Date(), checkedInByUserId: auth.userId }
      : { checkedIn: false, checkedInAt: null, checkedInByUserId: null },
  });
  return NextResponse.json({ attendee: { id: updated.id, checkedIn: updated.checkedIn, checkedInAt: updated.checkedInAt?.toISOString() ?? null } });
}
