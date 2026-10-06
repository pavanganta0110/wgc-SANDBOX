import type { Metadata } from "next";
import { notFound } from "next/navigation";
import DoorPayment from "@/components/events/DoorPayment";
import { loadPublicEvent } from "@/lib/eventRegistration/loadPublicEvent";
import { getPreviewChurchId } from "@/lib/campaigns/campaignPreviewSession";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Door payment", robots: { index: false, follow: false } };

/**
 * Card payment for a door sale: staff already entered the buyer and tickets
 * on the Check-in tab, so this goes straight to the payment fields with
 * those details filled in. Only reachable by a signed-in session of the
 * church that owns the event; anyone else gets a 404.
 */
export default async function DoorPayPage({ params }: { params: Promise<{ slug: string; registrationId: string }> }) {
  const { slug, registrationId } = await params;
  const churchId = await getPreviewChurchId();
  const data = await loadPublicEvent(slug, new Date(), { previewChurchId: churchId, doorMode: true });
  if (!data.ok || !data.isDoorSale || !churchId) notFound();

  const registration = await prisma.eventRegistration.findFirst({ where: { id: registrationId, eventId: data.eventId, churchId, soldAtDoor: true } });
  if (!registration) notFound();
  const attendees = await prisma.eventAttendee.findMany({ where: { registrationId: registration.id, churchId }, orderBy: { createdAt: "asc" }, select: { firstName: true, lastName: true } });

  return (
    <DoorPayment
      event={data.event}
      organization={data.organization}
      checkout={data.checkout}
      light={data.light}
      closedMessage={data.closedMessage}
      eventId={data.eventId}
      registration={{
        id: registration.id,
        status: registration.status,
        confirmationCode: registration.confirmationCode,
        totalCents: registration.totalCents,
        firstName: registration.registrantFirstName,
        lastName: registration.registrantLastName,
        email: registration.registrantEmail,
        phone: registration.registrantPhone ?? "",
        attendees,
      }}
    />
  );
}
