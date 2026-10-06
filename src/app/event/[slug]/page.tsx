import type { Metadata } from "next";
import { notFound } from "next/navigation";
import EventPageView from "@/components/events/EventPageView";
import { loadPublicEvent } from "@/lib/eventRegistration/loadPublicEvent";
import { getPreviewChurchId } from "@/lib/campaigns/campaignPreviewSession";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadPublicEvent(slug, new Date(), { previewChurchId: await getPreviewChurchId() });
  if (!data.ok) return { title: "Event not found", robots: { index: false } };
  return {
    ...(data.isPreview ? { robots: { index: false } } : {}),
    title: `${data.event.name} — ${data.organization.name}`,
    description: data.event.description?.slice(0, 160) || `Register for ${data.event.name} hosted by ${data.organization.name}.`,
  };
}

export default async function PublicEventPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ door?: string }> }) {
  const { slug } = await params;
  const { door } = await searchParams;
  // Signed-in staff of the owning organization can open a Draft/Inactive event.
  const data = await loadPublicEvent(slug, new Date(), { previewChurchId: await getPreviewChurchId(), doorMode: door === "1" });
  if (!data.ok) notFound();

  return (
    <EventPageView
      preview={data.isPreview}
      doorSale={data.isDoorSale}
      previewBanner={data.isPreview ? { eventId: data.eventId } : undefined}
      monthlyGiftSlug={data.monthlyGiftSlug}
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
