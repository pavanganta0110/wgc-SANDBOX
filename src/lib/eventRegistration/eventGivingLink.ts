import { prisma } from "@/lib/prisma";
import { generatePublicSlug } from "@/lib/givingLinks/validation";
import type { DonorFieldSettings } from "@/lib/givingLinks/types";

/**
 * Every Event owns one dedicated GivingLink and every payment for it is
 * charged through the ordinary /api/g/[slug]/donate route against that link
 * (tagged with the EventRegistration id) — there is no event payment
 * engine. Same ownership pattern as provisionCampaignGivingLink.
 *
 * The link's settings are derived from the event, never edited directly:
 * syncEventGivingLink() rewrites them whenever the event changes, so the
 * checkout can't drift from what the event page promises (required phone,
 * required mailing address, active/inactive).
 */

export interface EventLinkSource {
  name: string;
  status: string;
  mailingAddressMode: string;
  registrantPhoneRequired: boolean;
  /** Which methods the checkout offers (CARD | BANK | APPLE_PAY | GOOGLE_PAY). Omitted = all. */
  paymentMethods?: readonly string[] | null;
}

/** Everything the checkout can take. The page still hides a wallet the organization hasn't enabled (server availability check), exactly like a Giving Page. */
export const EVENT_LINK_PAYMENT_METHODS = ["CARD", "BANK", "APPLE_PAY", "GOOGLE_PAY"];

export function deriveEventLinkSettings(event: EventLinkSource) {
  const addressMode = event.mailingAddressMode;
  const donorFieldSettings: DonorFieldSettings = {
    firstName: "REQUIRED",
    lastName: "REQUIRED",
    email: "REQUIRED",
    phone: event.registrantPhoneRequired ? "REQUIRED" : "OPTIONAL",
    street: addressMode === "REQUIRED" ? "REQUIRED" : addressMode === "OPTIONAL" ? "OPTIONAL" : "HIDDEN",
    apartment: addressMode === "HIDDEN" ? "HIDDEN" : "OPTIONAL",
    city: addressMode === "REQUIRED" ? "REQUIRED" : addressMode === "OPTIONAL" ? "OPTIONAL" : "HIDDEN",
    state: addressMode === "REQUIRED" ? "REQUIRED" : addressMode === "OPTIONAL" ? "OPTIONAL" : "HIDDEN",
    postalCode: addressMode === "REQUIRED" ? "REQUIRED" : addressMode === "OPTIONAL" ? "OPTIONAL" : "HIDDEN",
    country: addressMode === "HIDDEN" ? "HIDDEN" : "OPTIONAL",
    donorNote: "HIDDEN",
    anonymousDonation: "HIDDEN",
    companyName: "HIDDEN",
  };
  const linkStatus = event.status === "ACTIVE" ? "ACTIVE" : event.status === "ARCHIVED" ? "ARCHIVED" : "INACTIVE";
  return {
    publicTitle: event.name,
    internalName: `Event: ${event.name}`.slice(0, 120),
    status: linkStatus,
    donorFieldSettingsJson: donorFieldSettings,
    collectMailingAddress: addressMode !== "HIDDEN",
    allowedPaymentMethodsJson: event.paymentMethods && event.paymentMethods.length > 0 ? [...event.paymentMethods] : EVENT_LINK_PAYMENT_METHODS,
  };
}

export async function provisionEventGivingLink(params: {
  churchId: string;
  ownerUserId: string | null;
  event: EventLinkSource;
}): Promise<string> {
  let publicSlug = generatePublicSlug();
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await prisma.givingLink.findUnique({ where: { publicSlug } });
    if (!existing) break;
    publicSlug = generatePublicSlug();
  }
  const derived = deriveEventLinkSettings(params.event);
  const link = await prisma.givingLink.create({
    data: {
      churchId: params.churchId,
      publicSlug,
      ...derived,
      // $1.00 is the smallest charge the donate flow accepts; the actual
      // amount is always dictated by the registration's server-computed
      // total (enforced in the donate route's eventRegistrationId check).
      amountType: "VARIABLE",
      minAmountCents: 100,
      allowCustomAmount: true,
      linkType: "MULTI_USE",
      recurringEnabled: false,
      feeCoverEnabled: true,
      feeCoverDefaultOn: true,
      createdByUserId: params.ownerUserId,
      ownerUserId: params.ownerUserId,
    },
  });
  return link.id;
}

/** Re-derives the dedicated link's settings from the event. No-op if the event has no link yet. */
export async function syncEventGivingLink(churchId: string, givingLinkId: string | null, event: EventLinkSource): Promise<void> {
  if (!givingLinkId) return;
  await prisma.givingLink.updateMany({
    where: { id: givingLinkId, churchId },
    data: deriveEventLinkSettings(event),
  });
}

/**
 * True when this giving link is an event's dedicated checkout link. Such a
 * link is only meant to be paid through its event page (the charge is tied
 * to a registration); the public giving page and the donate route both
 * refuse it otherwise, so nobody ends up making an "event" gift that no
 * registration owns.
 */
export async function isEventGivingLink(churchId: string, givingLinkId: string): Promise<boolean> {
  const event = await prisma.event.findFirst({ where: { churchId, givingLinkId }, select: { id: true } });
  return Boolean(event);
}

/**
 * The second, ordinary giving link behind an event's "make my additional
 * donation monthly" option. Unlike the checkout link above it is a ordinary,
 * public, recurring-enabled giving page — the registration itself stays a
 * single one-time charge, and the monthly gift is set up there afterwards
 * through the normal recurring-giving flow (so Finix subscriptions, receipts
 * and recovery all work exactly as for any recurring gift).
 */
export interface EventDonationLinkSource {
  name: string;
  status: string;
  hostName?: string | null;
  enabled: boolean;
}

export function deriveEventDonationLinkSettings(event: EventDonationLinkSource) {
  const live = event.enabled && event.status === "ACTIVE";
  return {
    publicTitle: `Support ${event.name}`.slice(0, 120),
    internalName: `Event monthly gift: ${event.name}`.slice(0, 120),
    description: `A monthly gift in connection with ${event.name}${event.hostName ? `, hosted by ${event.hostName}` : ""}.`,
    status: event.status === "ARCHIVED" ? "ARCHIVED" : live ? "ACTIVE" : "INACTIVE",
  };
}

export async function provisionEventDonationLink(params: { churchId: string; ownerUserId: string | null; event: EventDonationLinkSource }): Promise<string> {
  let publicSlug = generatePublicSlug();
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await prisma.givingLink.findUnique({ where: { publicSlug } });
    if (!existing) break;
    publicSlug = generatePublicSlug();
  }
  const link = await prisma.givingLink.create({
    data: {
      churchId: params.churchId,
      publicSlug,
      ...deriveEventDonationLinkSettings(params.event),
      amountType: "VARIABLE",
      minAmountCents: 100,
      allowCustomAmount: true,
      linkType: "MULTI_USE",
      recurringEnabled: true,
      allowedFrequenciesJson: ["MONTHLY"],
      defaultDonationType: "RECURRING",
      allowedPaymentMethodsJson: [...EVENT_LINK_PAYMENT_METHODS],
      feeCoverEnabled: true,
      feeCoverDefaultOn: true,
      createdByUserId: params.ownerUserId,
      ownerUserId: params.ownerUserId,
    },
  });
  return link.id;
}

export async function syncEventDonationLink(churchId: string, givingLinkId: string | null, event: EventDonationLinkSource): Promise<void> {
  if (!givingLinkId) return;
  await prisma.givingLink.updateMany({ where: { id: givingLinkId, churchId }, data: deriveEventDonationLinkSettings(event) });
}
