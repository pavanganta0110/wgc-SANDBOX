import { prisma } from "@/lib/prisma";
import { checkNonprofitVerificationStatus } from "@/lib/onboarding/nonprofitVerificationGuard";
import { parseBrandingSettings, parseDonorFieldSettings, parseAllowedPaymentMethods, resolveGivingPageLogo, type PaymentMethodKey } from "@/lib/givingLinks/types";
import { getPaymentMethodAvailability } from "@/lib/payments/paymentMethodAvailability";
import { parseCustomFields, type CustomFieldDefinition } from "@/lib/eventRegistration/customFields";
import { getDoorSaleState, getRegistrationState, REGISTRATION_CLOSED_MESSAGES } from "@/lib/eventRegistration/eventConfig";
import { formatEventDate, formatEventTime } from "@/lib/eventRegistration/timezone";

/**
 * Everything the public /event/[slug] page needs, resolved server-side and
 * reduced to plain serializable values. Only ACTIVE events are public —
 * DRAFT/INACTIVE/ARCHIVED all read as "not found", so an unpublished event
 * is never discoverable by guessing its slug.
 */

export interface PublicEventData {
  event: {
    slug: string;
    name: string;
    description: string | null;
    coverImageUrl: string | null;
    dateLabel: string;
    timeLabel: string;
    locationName: string | null;
    locationAddress: string | null;
    priceCents: number;
    priceMode: "PER_ATTENDEE" | "PER_REGISTRATION";
    allowOptionalDonation: boolean;
    donationPrompt: string | null;
    allowMultipleAttendees: boolean;
    maxAttendeesPerRegistration: number;
    attendeeEmailRequired: boolean;
    collectAttendeePhone: boolean;
    registrantPhoneRequired: boolean;
    allowGroups: boolean;
    groupLabel: string;
    groupRequired: boolean;
    mailingAddressMode: "HIDDEN" | "OPTIONAL" | "REQUIRED";
    confirmationMessage: string | null;
    confirmationImageUrl: string | null;
    confirmationVideoUrl: string | null;
    headerText: string | null;
    allowRecurringDonation: boolean;
    customFields: CustomFieldDefinition[];
  };
  addOns: { id: string; name: string; description: string | null; priceCents: number; maxQuantity: number }[];
  organization: { name: string; logoUrl: string | null; finixMerchantId: string | null };
  /** Slug of the event's monthly-gift page, when the event offers a recurring additional donation. */
  monthlyGiftSlug: string | null;
  /** Staff of the owning organization are running the checkout at the door (?door=1): the sign-up deadline doesn't apply and the buyer is auto-checked-in. */
  isDoorSale: boolean;
  /** The event's own staff are looking at a page that isn't public yet (Draft / Inactive). Nothing on it submits. */
  isPreview: boolean;
  eventId: string;
  /** null while the window is open; otherwise the reason shown instead of the form. */
  closedMessage: string | null;
  /** Paid events only: the dedicated giving link the checkout posts to. */
  checkout: null | {
    givingLinkSlug: string;
    donorFieldSettings: ReturnType<typeof parseDonorFieldSettings>;
    pricing: { cardPercentageFee: number | null; cardFixedFeeCents: number | null; achFixedFeeCents: number | null };
    feeCoverEnabled: boolean;
    feeCoverDefaultOn: boolean;
    allowedPaymentMethods: PaymentMethodKey[];
    googlePayGatewayMerchantId: string | null;
    googlePayMerchantId: string | null;
    googlePayEnvironment: "TEST" | "PRODUCTION";
    serverAvailability: { APPLE_PAY: { enabledForOrganization: boolean }; GOOGLE_PAY: { enabledForOrganization: boolean } };
  };
  light: ReturnType<typeof parseBrandingSettings>["light"];
  showPoweredByWgc: boolean;
}

export type LoadPublicEventResult = { ok: false } | ({ ok: true } & PublicEventData);

export async function loadPublicEvent(slug: string, now: Date = new Date(), opts: { previewChurchId?: string; doorMode?: boolean } = {}): Promise<LoadPublicEventResult> {
  const event = await prisma.event.findUnique({ where: { slug } });
  if (!event || event.archivedAt) return { ok: false };
  // A Draft/Inactive event is invisible to the public (404) — but the
  // organization's own signed-in staff can open it to check their work.
  const isPreview = event.status !== "ACTIVE";
  if (isPreview && opts.previewChurchId !== event.churchId) return { ok: false };

  const church = await prisma.church.findUnique({ where: { id: event.churchId } });
  if (!church) return { ok: false };

  const verification = await checkNonprofitVerificationStatus(church.id, church);
  // Door mode is honoured only for a signed-in session of the owning church;
  // for anyone else ?door=1 changes nothing.
  const isDoorSale = Boolean(opts.doorMode) && opts.previewChurchId === event.churchId;
  const doorState = isDoorSale ? getDoorSaleState(event, now) : null;
  const state = getRegistrationState(event, now);

  const addOns = await prisma.eventAddOn.findMany({
    where: { eventId: event.id, churchId: event.churchId, isActive: true },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
  });

  const link = event.givingLinkId ? await prisma.givingLink.findFirst({ where: { id: event.givingLinkId, churchId: event.churchId } }) : null;
  const monthlyGiftLink = event.allowRecurringDonation && event.donationGivingLinkId
    ? await prisma.givingLink.findFirst({ where: { id: event.donationGivingLinkId, churchId: event.churchId }, select: { publicSlug: true } })
    : null;
  const branding = parseBrandingSettings(link?.brandingSettingsJson ?? null);
  const pricing = await prisma.churchPricing.findUnique({ where: { churchId: church.id } });

  // Same wallet configuration the ordinary Giving Page uses, so Apple Pay /
  // Google Pay appear exactly when they would on that organization's other pages.
  const availability = link && church.finixMerchantId
    ? await getPaymentMethodAvailability(church.id, { onboardingApplicationId: church.onboardingApplicationId, finixMerchantId: church.finixMerchantId })
    : [];
  const walletAvailable = (method: "APPLE_PAY" | "GOOGLE_PAY") => availability.find((a) => a.method === method)?.enabledForOrganization ?? false;
  const googlePayEnvironment: "TEST" | "PRODUCTION" =
    process.env.NEXT_PUBLIC_FINIX_ENV === "live" && process.env.GOOGLE_PAY_PRODUCTION_APPROVED === "true" ? "PRODUCTION" : "TEST";

  let closedMessage: string | null;
  if (doorState) closedMessage = doorState.open ? null : doorState.message;
  else if (isPreview) closedMessage = null;
  else closedMessage = state.open ? null : REGISTRATION_CLOSED_MESSAGES[state.reason];
  // A paid event can't take money for an organization that isn't approved
  // or has no Finix merchant yet. Free RSVPs don't touch payments at all.
  if (!closedMessage && (event.priceCents > 0 || event.allowOptionalDonation || addOns.length > 0)) {
    if (!verification.isApproved || !church.finixMerchantId || !link) {
      closedMessage = event.priceCents > 0
        ? "Online registration for this event is not available right now. Please contact the organizer."
        : closedMessage;
    }
  }

  return {
    ok: true,
    event: {
      slug: event.slug,
      name: event.name,
      description: event.description,
      coverImageUrl: event.coverImageUrl,
      dateLabel: formatEventDate(event.startsAt, event.timezone),
      timeLabel: formatEventTime(event.startsAt, event.timezone),
      locationName: event.locationName,
      locationAddress: event.locationAddress,
      priceCents: event.priceCents,
      priceMode: event.priceMode === "PER_REGISTRATION" ? "PER_REGISTRATION" : "PER_ATTENDEE",
      allowOptionalDonation: event.allowOptionalDonation,
      donationPrompt: event.donationPrompt,
      allowMultipleAttendees: event.allowMultipleAttendees,
      maxAttendeesPerRegistration: event.maxAttendeesPerRegistration,
      attendeeEmailRequired: event.attendeeEmailRequired,
      collectAttendeePhone: event.collectAttendeePhone,
      registrantPhoneRequired: event.registrantPhoneRequired,
      allowGroups: event.allowGroups,
      groupLabel: event.groupLabel,
      groupRequired: event.groupRequired,
      mailingAddressMode: (["HIDDEN", "OPTIONAL", "REQUIRED"] as const).find((m) => m === event.mailingAddressMode) ?? "HIDDEN",
      confirmationMessage: event.confirmationMessage,
      confirmationImageUrl: event.confirmationImageUrl,
      confirmationVideoUrl: event.confirmationVideoUrl,
      headerText: event.headerText,
      allowRecurringDonation: event.allowRecurringDonation,
      customFields: parseCustomFields(event.customFieldsJson),
    },
    addOns: addOns.map((a) => ({ id: a.id, name: a.name, description: a.description, priceCents: a.priceCents, maxQuantity: a.maxQuantity })),
    organization: {
      name: event.hostName?.trim() || church.name,
      logoUrl: resolveGivingPageLogo({ givingPageLogoUrl: branding.light.logoUrl, organizationLogoUrl: church.logoUrl, fallbackLogoUrl: null }) || null,
      finixMerchantId: church.finixMerchantId,
    },
    monthlyGiftSlug: monthlyGiftLink?.publicSlug ?? null,
    isPreview: isPreview && !isDoorSale,
    isDoorSale,
    eventId: event.id,
    closedMessage,
    checkout: link
      ? {
          givingLinkSlug: link.publicSlug,
          donorFieldSettings: parseDonorFieldSettings(link.donorFieldSettingsJson),
          pricing: {
            cardPercentageFee: pricing?.cardPercentageFee ?? null,
            cardFixedFeeCents: pricing?.cardFixedFeeCents ?? null,
            achFixedFeeCents: pricing?.achFixedFeeCents ?? null,
          },
          feeCoverEnabled: link.feeCoverEnabled,
          feeCoverDefaultOn: link.feeCoverDefaultOn,
          allowedPaymentMethods: parseAllowedPaymentMethods(link.allowedPaymentMethodsJson),
          googlePayGatewayMerchantId: process.env.FINIX_APPLICATION_OWNER_ID || null,
          googlePayMerchantId: process.env.NEXT_PUBLIC_GOOGLE_PAY_MERCHANT_ID || null,
          googlePayEnvironment,
          serverAvailability: { APPLE_PAY: { enabledForOrganization: walletAvailable("APPLE_PAY") }, GOOGLE_PAY: { enabledForOrganization: walletAvailable("GOOGLE_PAY") } },
        }
      : null,
    light: branding.light,
    showPoweredByWgc: branding.showPoweredByWgc !== false,
  };
}
