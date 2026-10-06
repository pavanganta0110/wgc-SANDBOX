import crypto from "crypto";
import { isValidTimeZone, zonedLocalToUtc } from "@/lib/eventRegistration/timezone";
import { validateCustomFieldDefinitions, type CustomFieldDefinition } from "@/lib/eventRegistration/customFields";
import { resolveThankYouVideoEmbed } from "@/lib/givingLinks/types";

export const EVENT_STATUSES = ["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const PRICE_MODES = ["PER_ATTENDEE", "PER_REGISTRATION"] as const;
export const ADDRESS_MODES = ["HIDDEN", "OPTIONAL", "REQUIRED"] as const;
export type AddressMode = (typeof ADDRESS_MODES)[number];

export const EVENT_PAYMENT_METHODS = ["CARD", "BANK", "APPLE_PAY", "GOOGLE_PAY"] as const;
export type EventPaymentMethod = (typeof EVENT_PAYMENT_METHODS)[number];

/** Stored selection → the methods the checkout offers. Null / empty / junk = all four (the default). */
export function parseEventPaymentMethods(json: unknown): EventPaymentMethod[] {
  if (!Array.isArray(json)) return [...EVENT_PAYMENT_METHODS];
  const valid = EVENT_PAYMENT_METHODS.filter((m) => json.includes(m));
  return valid.length > 0 ? valid : [...EVENT_PAYMENT_METHODS];
}

export const MAX_ATTENDEES_CEILING = 50;
const MAX_PRICE_CENTS = 100_000_000;

export type RegistrationClosedReason = "NOT_ACTIVE" | "NOT_YET_OPEN" | "CLOSED" | "EVENT_ENDED";

export interface RegistrationWindowEvent {
  status: string;
  startsAt: Date;
  endsAt: Date | null;
  registrationOpensAt: Date | null;
  registrationClosesAt: Date | null;
}

/** Whether new registrations are being accepted right now — the single rule the public page and the register API both use. */
export function getRegistrationState(event: RegistrationWindowEvent, now: Date = new Date()): { open: true } | { open: false; reason: RegistrationClosedReason } {
  if (event.status !== "ACTIVE") return { open: false, reason: "NOT_ACTIVE" };
  if (event.registrationOpensAt && now < event.registrationOpensAt) return { open: false, reason: "NOT_YET_OPEN" };
  if (event.registrationClosesAt && now > event.registrationClosesAt) return { open: false, reason: "CLOSED" };
  // An event that's already over can't take registrations even if the
  // merchant forgot to set a deadline.
  if (now > (event.endsAt ?? event.startsAt)) return { open: false, reason: "EVENT_ENDED" };
  return { open: true };
}

export const REGISTRATION_CLOSED_MESSAGES: Record<RegistrationClosedReason, string> = {
  NOT_ACTIVE: "Registration for this event is not currently open.",
  NOT_YET_OPEN: "Registration for this event has not opened yet.",
  CLOSED: "Registration for this event has closed.",
  EVENT_ENDED: "This event has already taken place.",
};

// Unambiguous alphabet (no 0/O, 1/I/L) — read aloud at a check-in table.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function generateConfirmationCode(length = 8): string {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

export function publicEventPath(slug: string): string {
  return `/event/${slug}`;
}

const CANONICAL_ORIGIN = "https://www.wgcpayments.com";

/**
 * The origin this deployment's public event pages and embed script live on.
 * Same rule the Giving Page embed uses: each environment's own app URL
 * (so sandbox links point at sandbox, where its events actually exist),
 * production always the canonical domain, and the canonical domain as the
 * safe fallback when nothing is configured.
 */
export function appOrigin(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "";
  if (!base) return CANONICAL_ORIGIN;
  try {
    const url = new URL(base);
    if (url.hostname === "wgcpayments.com" || url.hostname === "www.wgcpayments.com") return CANONICAL_ORIGIN;
    return url.origin;
  } catch {
    return CANONICAL_ORIGIN;
  }
}

export function publicEventUrl(slug: string): string {
  return `${appOrigin()}${publicEventPath(slug)}`;
}

export interface EventSettingsData {
  name: string;
  description: string | null;
  coverImageUrl: string | null;
  status: EventStatus;
  timezone: string;
  startsAt: Date;
  endsAt: Date | null;
  locationName: string | null;
  locationAddress: string | null;
  registrationOpensAt: Date | null;
  registrationClosesAt: Date | null;
  priceCents: number;
  priceMode: string;
  registrationFmvCents: number | null;
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
  mailingAddressMode: AddressMode;
  confirmationMessage: string | null;
  confirmationImageUrl: string | null;
  confirmationVideoUrl: string | null;
  hostName: string | null;
  headerText: string | null;
  paymentMethods: EventPaymentMethod[];
  allowRecurringDonation: boolean;
  customFields: CustomFieldDefinition[];
}

export type EventSettingsValidation = { ok: true; data: EventSettingsData } | { ok: false; error: string };

function str(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function cents(value: unknown): number | null | "invalid" {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 0 || n > MAX_PRICE_CENTS) return "invalid";
  return n;
}

function isSafeImageUrl(value: string): boolean {
  if (value.startsWith("/")) return !value.startsWith("//");
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Validates and normalizes the merchant's create/edit form. Date fields
 * arrive as wall-clock strings ("2026-05-02T18:00") plus a timezone — the
 * browser's own zone is never consulted. Throws nothing; returns a specific
 * message the merchant can act on.
 */
export function validateEventSettings(input: Record<string, unknown>): EventSettingsValidation {
  const name = str(input.name, 120);
  if (!name) return { ok: false, error: "Event name is required." };

  const timezone = typeof input.timezone === "string" && isValidTimeZone(input.timezone) ? input.timezone : "America/Chicago";

  const startsAtLocal = typeof input.startsAtLocal === "string" ? input.startsAtLocal : "";
  const startsAt = zonedLocalToUtc(startsAtLocal, timezone);
  if (!startsAt) return { ok: false, error: "A valid event date and time is required." };

  const optionalDate = (key: string): Date | null | "invalid" => {
    const raw = input[key];
    if (raw === null || raw === undefined || raw === "") return null;
    if (typeof raw !== "string") return "invalid";
    const d = zonedLocalToUtc(raw, timezone);
    return d ?? "invalid";
  };
  const endsAt = optionalDate("endsAtLocal");
  if (endsAt === "invalid") return { ok: false, error: "The end date and time is not valid." };
  if (endsAt && endsAt < startsAt) return { ok: false, error: "The event can't end before it starts." };
  const opensAt = optionalDate("registrationOpensAtLocal");
  if (opensAt === "invalid") return { ok: false, error: "The registration open date is not valid." };
  const closesAt = optionalDate("registrationClosesAtLocal");
  if (closesAt === "invalid") return { ok: false, error: "The registration deadline is not valid." };
  if (opensAt && closesAt && closesAt < opensAt) return { ok: false, error: "The registration deadline can't be before registration opens." };

  const priceCentsRaw = cents(input.priceCents ?? 0);
  if (priceCentsRaw === "invalid" || priceCentsRaw === null) return { ok: false, error: "The registration price must be a valid amount." };
  if (priceCentsRaw > 0 && priceCentsRaw < 100) return { ok: false, error: "A paid registration must be at least $1.00 (or set it to free)." };

  const priceMode = (PRICE_MODES as readonly string[]).includes(String(input.priceMode)) ? String(input.priceMode) : "PER_ATTENDEE";

  const fmv = cents(input.registrationFmvCents);
  if (fmv === "invalid") return { ok: false, error: "The value of benefits received must be a valid amount." };
  if (fmv !== null && fmv > priceCentsRaw) return { ok: false, error: "The value of benefits received can't be more than the registration price." };

  const allowMultipleAttendees = input.allowMultipleAttendees !== false;
  const maxRaw = Number(input.maxAttendeesPerRegistration ?? 10);
  if (!Number.isInteger(maxRaw) || maxRaw < 1 || maxRaw > MAX_ATTENDEES_CEILING) {
    return { ok: false, error: `Attendees per registration must be between 1 and ${MAX_ATTENDEES_CEILING}.` };
  }

  const mailingAddressMode = (ADDRESS_MODES as readonly string[]).includes(String(input.mailingAddressMode))
    ? (String(input.mailingAddressMode) as AddressMode)
    : "HIDDEN";

  const coverImageUrl = str(input.coverImageUrl, 500);
  if (coverImageUrl && !isSafeImageUrl(coverImageUrl)) return { ok: false, error: "The cover image must be an https:// URL or an uploaded image." };

  const confirmationImageUrl = str(input.confirmationImageUrl, 500);
  if (confirmationImageUrl && !isSafeImageUrl(confirmationImageUrl)) return { ok: false, error: "The thank-you photo must be an https:// image or an uploaded image." };
  const confirmationVideoUrl = str(input.confirmationVideoUrl, 500);
  if (confirmationVideoUrl && !resolveThankYouVideoEmbed(confirmationVideoUrl)) {
    return { ok: false, error: "That video link isn't supported. Use a YouTube, Vimeo, TikTok, Instagram or Facebook link, a direct .mp4/.webm link, or upload a video." };
  }

  const rawMethods = Array.isArray(input.paymentMethods) ? input.paymentMethods : null;
  const paymentMethods = rawMethods ? EVENT_PAYMENT_METHODS.filter((m) => rawMethods.includes(m)) : [...EVENT_PAYMENT_METHODS];
  if (rawMethods && paymentMethods.length === 0) return { ok: false, error: "Choose at least one way for people to pay." };

  const status = (EVENT_STATUSES as readonly string[]).includes(String(input.status)) ? (String(input.status) as EventStatus) : "DRAFT";

  const fields = validateCustomFieldDefinitions(input.customFields);
  if (!fields.ok) return fields;

  return {
    ok: true,
    data: {
      name,
      description: str(input.description, 5000),
      coverImageUrl,
      status,
      timezone,
      startsAt,
      endsAt,
      locationName: str(input.locationName, 200),
      locationAddress: str(input.locationAddress, 300),
      registrationOpensAt: opensAt,
      registrationClosesAt: closesAt,
      priceCents: priceCentsRaw,
      priceMode,
      registrationFmvCents: fmv,
      allowOptionalDonation: Boolean(input.allowOptionalDonation),
      donationPrompt: str(input.donationPrompt, 200),
      allowMultipleAttendees,
      maxAttendeesPerRegistration: allowMultipleAttendees ? maxRaw : 1,
      attendeeEmailRequired: Boolean(input.attendeeEmailRequired),
      collectAttendeePhone: Boolean(input.collectAttendeePhone),
      registrantPhoneRequired: Boolean(input.registrantPhoneRequired),
      allowGroups: Boolean(input.allowGroups),
      groupLabel: str(input.groupLabel, 60) ?? "Team / Group Name",
      groupRequired: Boolean(input.allowGroups) && Boolean(input.groupRequired),
      mailingAddressMode,
      confirmationMessage: str(input.confirmationMessage, 3000),
      confirmationImageUrl,
      confirmationVideoUrl,
      hostName: str(input.hostName, 120),
      headerText: str(input.headerText, 200),
      paymentMethods,
      allowRecurringDonation: Boolean(input.allowOptionalDonation) && Boolean(input.allowRecurringDonation),
      customFields: fields.fields,
    },
  };
}

export interface AddOnInput {
  id?: string;
  name: string;
  description: string | null;
  priceCents: number;
  fmvCents: number | null;
  maxQuantity: number;
  isActive: boolean;
}

export type AddOnsValidation = { ok: true; addOns: AddOnInput[] } | { ok: false; error: string };

export const MAX_ADDONS = 25;

export function validateAddOns(input: unknown): AddOnsValidation {
  if (input == null) return { ok: true, addOns: [] };
  if (!Array.isArray(input)) return { ok: false, error: "Add-ons must be a list." };
  if (input.length > MAX_ADDONS) return { ok: false, error: `An event can have at most ${MAX_ADDONS} add-ons.` };
  const out: AddOnInput[] = [];
  for (const raw of input) {
    if (typeof raw !== "object" || raw === null) return { ok: false, error: "Each add-on must be an object." };
    const r = raw as Record<string, unknown>;
    const name = str(r.name, 120);
    if (!name) return { ok: false, error: "Every add-on needs a name." };
    const price = cents(r.priceCents);
    if (price === "invalid" || price === null) return { ok: false, error: `"${name}" needs a valid price.` };
    if (price < 100) return { ok: false, error: `"${name}" must cost at least $1.00.` };
    const fmv = cents(r.fmvCents);
    if (fmv === "invalid") return { ok: false, error: `"${name}" has an invalid benefit value.` };
    if (fmv !== null && fmv > price) return { ok: false, error: `The benefit value for "${name}" can't exceed its price.` };
    const maxQuantity = Number(r.maxQuantity ?? 1);
    if (!Number.isInteger(maxQuantity) || maxQuantity < 1 || maxQuantity > 100) {
      return { ok: false, error: `"${name}" must allow between 1 and 100 per registration.` };
    }
    out.push({
      ...(typeof r.id === "string" && r.id ? { id: r.id } : {}),
      name,
      description: str(r.description, 500),
      priceCents: price,
      fmvCents: fmv,
      maxQuantity,
      isActive: r.isActive !== false,
    });
  }
  return { ok: true, addOns: out };
}
