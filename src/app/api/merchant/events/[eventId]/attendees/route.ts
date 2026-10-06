import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardEventsRoute, loadOwnedEvent, notFoundResponse } from "@/lib/eventRegistration/merchantGuard";
import { parseCustomFields } from "@/lib/eventRegistration/customFields";

type Ctx = { params: Promise<{ eventId: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const guard = await guardEventsRoute("canViewEvents");
  if ("response" in guard) return guard.response;
  const { auth } = guard;
  const { eventId } = await params;

  const event = await loadOwnedEvent(auth.churchId, eventId);
  if (!event) return notFoundResponse();

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const checkedIn = searchParams.get("checkedIn");
  const group = (searchParams.get("group") || "").trim();

  // Only attendees of CONFIRMED registrations are real attendees.
  const registrations = await prisma.eventRegistration.findMany({
    where: { churchId: auth.churchId, eventId: event.id, status: "CONFIRMED", ...(group ? { groupName: group } : {}) },
    select: { id: true, confirmationCode: true, groupName: true, registrantFirstName: true, registrantLastName: true },
  });
  const regById = new Map(registrations.map((r) => [r.id, r]));

  const attendees = await prisma.eventAttendee.findMany({
    where: {
      churchId: auth.churchId,
      eventId: event.id,
      registrationId: { in: registrations.map((r) => r.id) },
      ...(checkedIn === "true" ? { checkedIn: true } : checkedIn === "false" ? { checkedIn: false } : {}),
      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              // A confirmation code read aloud at the door finds the whole party.
              { registrationId: { in: registrations.filter((r) => r.confirmationCode === q.toUpperCase()).map((r) => r.id) } },
            ],
          }
        : {}),
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 2000,
  });

  const groups = [...new Set(
    (await prisma.eventRegistration.findMany({
      where: { churchId: auth.churchId, eventId: event.id, status: "CONFIRMED", groupName: { not: null } },
      select: { groupName: true },
    })).map((r) => r.groupName as string)
  )].sort();

  return NextResponse.json({
    fields: parseCustomFields(event.customFieldsJson).filter((f) => f.appliesTo === "ATTENDEE"),
    groups,
    attendees: attendees.map((a) => {
      const reg = regById.get(a.registrationId);
      return {
        id: a.id,
        firstName: a.firstName,
        lastName: a.lastName,
        email: a.email,
        phone: a.phone,
        checkedIn: a.checkedIn,
        checkedInAt: a.checkedInAt?.toISOString() ?? null,
        customResponses: a.customResponsesJson ?? {},
        confirmationCode: reg?.confirmationCode ?? "",
        groupName: reg?.groupName ?? null,
        registrantName: reg ? `${reg.registrantFirstName} ${reg.registrantLastName}`.trim() : "",
      };
    }),
  });
}
