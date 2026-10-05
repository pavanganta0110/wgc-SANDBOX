import { prisma } from "@/lib/prisma";
import { normalizeEmail, isValidEmail } from "@/lib/donors/donorContact";

/**
 * Who an event's emails (and the outbound Giving Campaign composer's "Event"
 * audience) can reach. Everything is read from EventAttendee /
 * EventRegistration directly — never from Payment or Donor — so someone who
 * registered for free and never paid anything is still emailable.
 *
 * Only CONFIRMED registrations count: a PENDING cart that never
 * completed, or a CANCELED registration, is never an audience member.
 */

export const EVENT_AUDIENCE_SCOPES = [
  "ALL_ATTENDEES",
  "PRIMARY_REGISTRANTS",
  "CHECKED_IN",
  "NOT_CHECKED_IN",
  "EVERYONE",
] as const;
export type EventAudienceScope = (typeof EVENT_AUDIENCE_SCOPES)[number];

export const EVENT_AUDIENCE_SCOPE_LABELS: Record<EventAudienceScope, string> = {
  ALL_ATTENDEES: "All attendees",
  PRIMARY_REGISTRANTS: "Primary registrants",
  CHECKED_IN: "Checked-in attendees",
  NOT_CHECKED_IN: "Attendees not checked in",
  EVERYONE: "Attendees and registrants",
};

export function isEventAudienceScope(value: unknown): value is EventAudienceScope {
  return typeof value === "string" && (EVENT_AUDIENCE_SCOPES as readonly string[]).includes(value);
}

export interface AudienceRecipient {
  email: string;
  normalizedEmail: string;
  /** Full name, or null when unknown. */
  name: string | null;
  firstName: string | null;
  donorId: string | null;
  registrationId: string;
}

interface RegistrationRow {
  id: string;
  registrantFirstName: string;
  registrantLastName: string;
  registrantEmail: string;
  donorId: string | null;
}

interface AttendeeRow {
  registrationId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  donorId: string | null;
  checkedIn: boolean;
}

/**
 * Pure: turns already-loaded rows into a de-duplicated recipient list for a
 * scope. Two people sharing one inbox (a parent registering the whole
 * family under one address) are one recipient — first occurrence wins,
 * attendees before registrants so a person's own name is preferred.
 */
export function buildEventAudience(registrations: RegistrationRow[], attendees: AttendeeRow[], scope: EventAudienceScope): AudienceRecipient[] {
  const out: AudienceRecipient[] = [];
  const seen = new Set<string>();

  const push = (r: AudienceRecipient) => {
    if (seen.has(r.normalizedEmail)) return;
    seen.add(r.normalizedEmail);
    out.push(r);
  };

  const attendeePool = attendees.filter((a) => {
    if (scope === "CHECKED_IN") return a.checkedIn;
    if (scope === "NOT_CHECKED_IN") return !a.checkedIn;
    return scope === "ALL_ATTENDEES" || scope === "EVERYONE";
  });
  for (const a of attendeePool) {
    if (!a.email || !isValidEmail(a.email)) continue;
    const normalizedEmail = normalizeEmail(a.email)!;
    push({
      email: a.email,
      normalizedEmail,
      name: `${a.firstName} ${a.lastName}`.trim() || null,
      firstName: a.firstName || null,
      donorId: a.donorId,
      registrationId: a.registrationId,
    });
  }

  if (scope === "PRIMARY_REGISTRANTS" || scope === "EVERYONE") {
    for (const r of registrations) {
      if (!r.registrantEmail || !isValidEmail(r.registrantEmail)) continue;
      const normalizedEmail = normalizeEmail(r.registrantEmail)!;
      push({
        email: r.registrantEmail,
        normalizedEmail,
        name: `${r.registrantFirstName} ${r.registrantLastName}`.trim() || null,
        firstName: r.registrantFirstName || null,
        donorId: r.donorId,
        registrationId: r.id,
      });
    }
  }
  return out;
}

/** Loads and builds an event's audience. `churchId` is mandatory — an event id alone is never enough. */
export async function loadEventAudience(churchId: string, eventId: string, scope: EventAudienceScope): Promise<AudienceRecipient[]> {
  const registrations = await prisma.eventRegistration.findMany({
    where: { churchId, eventId, status: "CONFIRMED" },
    select: { id: true, registrantFirstName: true, registrantLastName: true, registrantEmail: true, donorId: true },
    orderBy: { createdAt: "asc" },
  });
  if (registrations.length === 0) return [];
  const attendees = await prisma.eventAttendee.findMany({
    where: { churchId, eventId, registrationId: { in: registrations.map((r) => r.id) } },
    select: { registrationId: true, firstName: true, lastName: true, email: true, donorId: true, checkedIn: true },
    orderBy: { createdAt: "asc" },
  });
  return buildEventAudience(registrations, attendees, scope);
}
