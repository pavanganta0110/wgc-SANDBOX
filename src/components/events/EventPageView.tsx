import { CalendarDays, Clock, MapPin } from "lucide-react";
import EventRegistrationForm from "@/components/events/EventRegistrationForm";
import OrganizationBrandHeader from "@/components/merchant/OrganizationBrandHeader";
import PoweredByWgc from "@/components/merchant/PoweredByWgc";
import { formatCents } from "@/lib/format";
import type { PublicEventData } from "@/lib/eventRegistration/loadPublicEvent";

/**
 * The public event page's visual body — one component used by the real
 * /event/[slug] page AND by the live preview in the event editor, so the
 * preview can never drift from what registrants actually see.
 */
export interface EventPageViewProps {
  event: PublicEventData["event"];
  addOns: PublicEventData["addOns"];
  organization: PublicEventData["organization"];
  checkout: PublicEventData["checkout"];
  light: PublicEventData["light"];
  closedMessage: string | null;
  showPoweredByWgc: boolean;
  /** Editor preview: the form is interactive but never submits or charges. */
  preview?: boolean;
  /** Rendered inside an iframe on another website: no full-page height or outer chrome. */
  embed?: boolean;
  /** Replaces the registration form (e.g. the embed's "Register & pay" button for events that take payment). */
  formOverride?: React.ReactNode;
}

export default function EventPageView({ event, addOns, organization, checkout, light, closedMessage, showPoweredByWgc, preview = false, embed = false, formOverride }: EventPageViewProps) {
  const priceLabel =
    event.priceCents > 0 ? `${formatCents(event.priceCents)} ${event.priceMode === "PER_ATTENDEE" ? "per person" : "per registration"}` : "Free";

  return (
    <div className={preview || embed ? "py-4 px-2" : "min-h-screen py-10 px-4"} style={{ backgroundColor: light.pageBackground }}>
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
          {event.timeLabel && (
            <li className="flex items-start gap-2">
              <Clock className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
              <span>{event.timeLabel}</span>
            </li>
          )}
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
        ) : formOverride ? (
          formOverride
        ) : (
          <EventRegistrationForm event={event} addOns={addOns} organization={organization} checkout={checkout} light={light} previewMode={preview} />
        )}

        {showPoweredByWgc && <PoweredByWgc />}
      </div>
    </div>
  );
}
