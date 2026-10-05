import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarDays, Clock, MapPin } from "lucide-react";
import EventRegistrationForm from "@/components/events/EventRegistrationForm";
import OrganizationBrandHeader from "@/components/merchant/OrganizationBrandHeader";
import PoweredByWgc from "@/components/merchant/PoweredByWgc";
import { loadPublicEvent } from "@/lib/eventRegistration/loadPublicEvent";
import { formatCents } from "@/lib/format";

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

  const { event, addOns, organization, checkout, light, closedMessage } = data;
  const priceLabel =
    event.priceCents > 0 ? `${formatCents(event.priceCents)} ${event.priceMode === "PER_ATTENDEE" ? "per person" : "per registration"}` : "Free";

  return (
    <div className="min-h-screen py-10 px-4" style={{ backgroundColor: light.pageBackground }}>
      <div className="max-w-xl mx-auto rounded-2xl shadow-sm border p-6 sm:p-8" style={{ borderColor: light.borderColor, backgroundColor: light.headerBackground }}>
        <OrganizationBrandHeader
          logoUrl={organization.logoUrl}
          organizationName={organization.name}
          kind="Event Registration"
          nameColor={light.headingColor}
          kindColor={light.bodyTextColor}
        />

        {event.coverImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.coverImageUrl} alt="" className="w-full max-h-64 object-cover rounded-xl mb-6" />
        )}

        <h1 className="text-2xl font-bold mb-3 text-balance" style={{ color: light.headingColor }}>
          {event.name}
        </h1>

        <ul className="space-y-1.5 text-sm mb-5" style={{ color: light.bodyTextColor }}>
          <li className="flex items-start gap-2">
            <CalendarDays className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
            <span>{event.dateLabel}</span>
          </li>
          <li className="flex items-start gap-2">
            <Clock className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
            <span>{event.timeLabel}</span>
          </li>
          {(event.locationName || event.locationAddress) && (
            <li className="flex items-start gap-2">
              <MapPin className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
              <span>{[event.locationName, event.locationAddress].filter(Boolean).join(" · ")}</span>
            </li>
          )}
          <li className="font-semibold" style={{ color: light.headingColor }}>
            {priceLabel}
          </li>
        </ul>

        {event.description && (
          <p className="text-sm whitespace-pre-line mb-6" style={{ color: light.bodyTextColor }}>
            {event.description}
          </p>
        )}

        <hr className="mb-6" style={{ borderColor: light.borderColor }} />

        {closedMessage ? (
          <div role="status" className="text-center py-6">
            <p className="font-semibold mb-1" style={{ color: light.headingColor }}>
              {closedMessage}
            </p>
            <p className="text-sm" style={{ color: light.bodyTextColor }}>
              Contact {organization.name} with any questions.
            </p>
          </div>
        ) : (
          <EventRegistrationForm
            event={event}
            addOns={addOns}
            organization={organization}
            checkout={checkout}
            light={light}
          />
        )}

        {data.showPoweredByWgc && <PoweredByWgc />}
      </div>
    </div>
  );
}
