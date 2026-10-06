import { zonedLocalToUtc, formatEventDate, formatEventTime } from "@/lib/eventRegistration/timezone";
import type { PublicEventData } from "@/lib/eventRegistration/loadPublicEvent";
import type { CustomFieldDefinition } from "@/lib/eventRegistration/customFields";

/**
 * Turns the (possibly half-finished) event editor state into the exact data
 * shape the public event page renders, so the editor's live preview can
 * show the real page as the merchant types. Tolerant by design: empty
 * names, unfinished dropdowns, bad dates and blank prices fall back to
 * sensible placeholders instead of throwing — it never validates, it only
 * mirrors.
 */

export interface PreviewFormValues {
  name: string;
  description: string;
  coverImageUrl: string;
  timezone: string;
  startsAtLocal: string;
  locationName: string;
  locationAddress: string;
  priceMode: string;
  allowOptionalDonation: boolean;
  donationPrompt: string;
  allowMultipleAttendees: boolean;
  maxAttendeesPerRegistration: number;
  attendeeEmailRequired: boolean;
  collectAttendeePhone: boolean;
  registrantPhoneRequired: boolean;
  allowGroups: boolean;
  groupLabel: string;
  groupRequired: boolean;
  mailingAddressMode: string;
  confirmationMessage: string;
  confirmationImageUrl: string;
  confirmationVideoUrl: string;
  headerText: string;
  allowRecurringDonation: boolean;
  customFields: CustomFieldDefinition[];
}

export interface PreviewAddOn {
  name: string;
  description: string;
  priceCents: number;
  maxQuantity: number;
  isActive: boolean;
}

export function buildPreviewEvent(v: PreviewFormValues, priceCents: number): PublicEventData["event"] {
  const startsAt = v.startsAtLocal ? zonedLocalToUtc(v.startsAtLocal, v.timezone) : null;
  const mode = (["HIDDEN", "OPTIONAL", "REQUIRED"] as const).find((m) => m === v.mailingAddressMode) ?? "HIDDEN";

  const customFields: CustomFieldDefinition[] = v.customFields
    .filter((f) => f.label.trim() && (f.type !== "DROPDOWN" || (f.options?.length ?? 0) > 0))
    .map((f, i) => ({ ...f, id: f.id || `preview-field-${i}` }));

  return {
    slug: "preview",
    name: v.name.trim() || "Your event name",
    description: v.description.trim() || null,
    coverImageUrl: v.coverImageUrl.trim() || null,
    dateLabel: startsAt ? formatEventDate(startsAt, v.timezone) : "Date to be announced",
    timeLabel: startsAt ? formatEventTime(startsAt, v.timezone) : "",
    locationName: v.locationName.trim() || null,
    locationAddress: v.locationAddress.trim() || null,
    priceCents: Math.max(0, priceCents),
    priceMode: v.priceMode === "PER_REGISTRATION" ? "PER_REGISTRATION" : "PER_ATTENDEE",
    allowOptionalDonation: v.allowOptionalDonation,
    donationPrompt: v.donationPrompt.trim() || null,
    allowMultipleAttendees: v.allowMultipleAttendees,
    maxAttendeesPerRegistration: v.allowMultipleAttendees ? Math.max(1, v.maxAttendeesPerRegistration || 1) : 1,
    attendeeEmailRequired: v.attendeeEmailRequired,
    collectAttendeePhone: v.collectAttendeePhone,
    registrantPhoneRequired: v.registrantPhoneRequired,
    allowGroups: v.allowGroups,
    groupLabel: v.groupLabel.trim() || "Team / Group Name",
    groupRequired: v.allowGroups && v.groupRequired,
    mailingAddressMode: mode,
    confirmationMessage: v.confirmationMessage.trim() || null,
    confirmationImageUrl: v.confirmationImageUrl.trim() || null,
    confirmationVideoUrl: v.confirmationVideoUrl.trim() || null,
    headerText: v.headerText.trim() || null,
    allowRecurringDonation: v.allowOptionalDonation && v.allowRecurringDonation,
    customFields,
  };
}

export function buildPreviewAddOns(addOns: PreviewAddOn[]): PublicEventData["addOns"] {
  return addOns
    .filter((a) => a.isActive && a.name.trim() && a.priceCents > 0)
    .map((a, i) => ({
      id: `preview-addon-${i}`,
      name: a.name.trim(),
      description: a.description.trim() || null,
      priceCents: a.priceCents,
      maxQuantity: Math.min(100, Math.max(1, a.maxQuantity || 1)),
    }));
}
