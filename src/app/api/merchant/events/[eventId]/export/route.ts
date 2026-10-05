import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { csvResponse } from "@/lib/csvExport";
import { guardEventsRoute, loadOwnedEvent, notFoundResponse } from "@/lib/eventRegistration/merchantGuard";
import { parseCustomFields } from "@/lib/eventRegistration/customFields";
import { buildEventCsv } from "@/lib/eventRegistration/eventCsv";
import { slugifyEventName } from "@/lib/eventRegistration/eventSlug";

type Ctx = { params: Promise<{ eventId: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const guard = await guardEventsRoute("canExportEvents");
  if ("response" in guard) return guard.response;
  const { auth } = guard;
  const { eventId } = await params;

  const event = await loadOwnedEvent(auth.churchId, eventId);
  if (!event) return notFoundResponse();

  const registrations = await prisma.eventRegistration.findMany({
    where: { churchId: auth.churchId, eventId: event.id, status: "CONFIRMED" },
    orderBy: { createdAt: "asc" },
  });
  const registrationIds = registrations.map((r) => r.id);
  const [attendees, addOnLines] = await Promise.all([
    prisma.eventAttendee.findMany({ where: { churchId: auth.churchId, eventId: event.id, registrationId: { in: registrationIds } } }),
    prisma.eventRegistrationAddOn.findMany({ where: { churchId: auth.churchId, registrationId: { in: registrationIds } } }),
  ]);
  const paymentIds = registrations.map((r) => r.paymentId).filter((id): id is string => Boolean(id));
  const payments = paymentIds.length
    ? await prisma.payment.findMany({ where: { churchId: auth.churchId, id: { in: paymentIds } }, select: { id: true, status: true } })
    : [];

  const csv = buildEventCsv({
    eventName: event.name,
    timezone: event.timezone,
    fields: parseCustomFields(event.customFieldsJson),
    registrations,
    attendees,
    addOnLines,
    paymentStatusById: new Map(payments.map((p) => [p.id, p.status])),
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "event.exported",
    entityType: "event",
    entityId: event.id,
    metadata: { registrations: registrations.length, attendees: attendees.length },
    req,
  });

  const date = new Date().toISOString().slice(0, 10);
  return csvResponse(csv, `${slugifyEventName(event.name)}-registrations-${date}.csv`);
}
