import { notFound } from "next/navigation";
import { headers } from "next/headers";
import EventPageView from "@/components/events/EventPageView";
import { EventEmbedFrame, RegisterInWindowButton } from "@/components/events/EventEmbedFrame";
import { loadPublicEvent } from "@/lib/eventRegistration/loadPublicEvent";
import { prisma } from "@/lib/prisma";
import { isEmbedOriginAllowed, parseEmbedAllowedDomains } from "@/lib/giving/embedDomainCheck";
import { formatCents } from "@/lib/format";

/**
 * Chrome-free event page meant to be iframed on third-party websites by
 * public/embed/wgc-event.js. /embed/* already allows cross-origin framing
 * (see next.config.ts); an organization's optional approved-domains list is
 * enforced here, the same way as the Giving Page embed.
 *
 * Free events can be registered for right in the frame. Anything that can
 * take a payment shows the details plus a "Register & pay" button that
 * opens the full page in its own window, because Finix's card form refuses
 * to run inside a frame.
 */
export default async function EmbedEventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await loadPublicEvent(slug);
  if (!data.ok) notFound();

  const event = await prisma.event.findUnique({ where: { slug }, select: { churchId: true } });
  const church = event ? await prisma.church.findUnique({ where: { id: event.churchId }, select: { embedDomainRestrictionEnabled: true, embedAllowedDomainsJson: true } }) : null;
  if (church?.embedDomainRestrictionEnabled) {
    const referer = (await headers()).get("referer");
    if (!isEmbedOriginAllowed(referer, parseEmbedAllowedDomains(church.embedAllowedDomainsJson))) {
      return (
        <div className="p-6 text-center text-sm text-slate-600">
          This event is not authorized to be embedded on this website. Please contact {data.organization.name}.
        </div>
      );
    }
  }

  const { light } = data;
  const takesPayment = data.event.priceCents > 0 || data.addOns.length > 0 || data.event.allowOptionalDonation;
  const label = data.event.priceCents > 0 ? `Register & pay — ${formatCents(data.event.priceCents)}${data.event.priceMode === "PER_ATTENDEE" ? " per person" : ""}` : "Register";

  return (
    <EventEmbedFrame slug={slug}>
      <EventPageView
        event={data.event}
        addOns={data.addOns}
        organization={data.organization}
        checkout={data.checkout}
        light={light}
        closedMessage={data.closedMessage}
        showPoweredByWgc={data.showPoweredByWgc}
        embed
        monthlyGiftSlug={data.monthlyGiftSlug}
        formOverride={takesPayment ? <RegisterInWindowButton slug={slug} label={label} backgroundColor={light.buttonBackground} color={light.buttonText} /> : undefined}
      />
    </EventEmbedFrame>
  );
}
