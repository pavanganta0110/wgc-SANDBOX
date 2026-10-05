import type { Metadata } from "next";
import { notFound } from "next/navigation";
import EventPageView from "@/components/events/EventPageView";
import { loadPublicEvent } from "@/lib/eventRegistration/loadPublicEvent";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadPublicEvent(slug);
  if (!data.ok) return { title: "Event not found", robots: { index: false } };
  return {
    title: `${data.event.name} — ${data.organization.name}`,
    description: data.event.description?.slice(0, 160) || `Register for ${data.event.name} hosted by ${data.organization.name}.`,
  };
}

export default async function PublicEventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await loadPublicEvent(slug);
  if (!data.ok) notFound();

  return (
    <EventPageView
      event={data.event}
      addOns={data.addOns}
      organization={data.organization}
      checkout={data.checkout}
      light={data.light}
      closedMessage={data.closedMessage}
      showPoweredByWgc={data.showPoweredByWgc}
    />
  );
}
