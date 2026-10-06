import { prisma } from "@/lib/prisma";
import { formatEventDate, formatEventTime } from "@/lib/eventRegistration/timezone";

/**
 * The merge-field values for a campaign tied to an Event ("you're invited…").
 * Always looked up by (id, churchId), so one organization can never pull
 * another's event into its email.
 */
export interface CampaignEventVars {
  slug: string;
  status: string;
  eventName: string;
  eventDate: string;
  eventTime: string;
  eventLocation: string;
}

export async function loadCampaignEventVars(churchId: string, eventId: string): Promise<CampaignEventVars | null> {
  const event = await prisma.event.findFirst({
    where: { id: eventId, churchId, archivedAt: null },
    select: { slug: true, status: true, name: true, startsAt: true, timezone: true, locationName: true, locationAddress: true },
  });
  if (!event) return null;
  return {
    slug: event.slug,
    status: event.status,
    eventName: event.name,
    eventDate: formatEventDate(event.startsAt, event.timezone),
    eventTime: formatEventTime(event.startsAt, event.timezone),
    eventLocation: [event.locationName, event.locationAddress].filter(Boolean).join(", ") || "the event location",
  };
}
