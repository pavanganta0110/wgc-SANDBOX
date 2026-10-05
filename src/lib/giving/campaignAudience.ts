import { prisma } from "@/lib/prisma";
import { isValidEmail, normalizeEmail } from "@/lib/donors/donorContact";
import { loadOptedOutEmails } from "@/lib/giving/emailOptOut";
import { isEventAudienceScope, loadEventAudience, type EventAudienceScope } from "@/lib/eventRegistration/audience";

/**
 * Who a Giving Campaign (outbound email/text) is addressed to. The original
 * composer sends to hand-picked donors (SELECTED); this adds audiences that
 * are resolved server-side from the church's own data:
 *
 *  - ALL_DONORS         everyone who has actually given (a successful payment
 *                       or a recorded external gift) with the needed contact info
 *  - GIVING_PAGE        donors who completed a payment through one giving page
 *  - EVENT              an event's attendees/registrants (email only) — read
 *                       from registration rows, so people who registered free
 *                       and never paid are included
 *  - IMPORTED_CONTACTS  contacts added by CSV import (no donation required)
 *  - NOT_GIVEN          everyone on file with an email who has never given:
 *                       no successful payment and no recorded external gift
 *                       (event registrants, imported contacts, newsletter
 *                       sign-ups, prospects)
 *
 * Every query is filtered by churchId, and every referenced id (giving page,
 * event) is re-verified to belong to that church. Recipients are
 * de-duplicated by normalized email (or phone for texts). Addresses that
 * unsubscribed from this church's bulk email are always left out of email
 * audiences.
 */

export const AUDIENCE_SOURCES = ["SELECTED", "ALL_DONORS", "GIVING_PAGE", "EVENT", "IMPORTED_CONTACTS", "NOT_GIVEN"] as const;
export type AudienceSource = (typeof AUDIENCE_SOURCES)[number];

export function isAudienceSource(v: unknown): v is AudienceSource {
  return typeof v === "string" && (AUDIENCE_SOURCES as readonly string[]).includes(v);
}

export interface AudienceRequest {
  source: AudienceSource;
  donorIds?: string[];
  givingLinkId?: string;
  eventId?: string;
  eventScope?: string;
}

export interface AudienceRecipient {
  donorId: string | null;
  email: string | null;
  phone: string | null;
  name: string | null;
}

export type AudienceResult = { ok: true; recipients: AudienceRecipient[] } | { ok: false; status: number; error: string };

const MAX_AUDIENCE = 20000;

interface DonorRow {
  id: string;
  name: string | null;
  email: string | null;
  normalizedEmail: string | null;
  normalizedPhone: string | null;
}

const donorSelect = { id: true, name: true, email: true, normalizedEmail: true, normalizedPhone: true } as const;
const activeDonor = { archivedAt: null, mergedIntoDonorId: null } as const;

function dedupe(rows: DonorRow[], channel: "EMAIL" | "TEXT"): AudienceRecipient[] {
  const seen = new Set<string>();
  const out: AudienceRecipient[] = [];
  for (const d of rows) {
    const key = channel === "TEXT" ? d.normalizedPhone : d.normalizedEmail || normalizeEmail(d.email);
    if (!key) continue;
    if (channel === "EMAIL" && d.email && !isValidEmail(d.email)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ donorId: d.id, email: channel === "EMAIL" ? d.email : null, phone: channel === "TEXT" ? d.normalizedPhone : null, name: d.name });
  }
  return out;
}

async function resolveRawAudience(churchId: string, req: AudienceRequest, channel: "EMAIL" | "TEXT"): Promise<AudienceResult> {
  const contactFilter = channel === "TEXT" ? { normalizedPhone: { not: null } } : { email: { not: null } };

  switch (req.source) {
    case "SELECTED": {
      const ids = (req.donorIds ?? []).filter((id) => typeof id === "string");
      if (ids.length === 0) return { ok: false, status: 400, error: "Select at least one donor." };
      const rows = await prisma.donor.findMany({ where: { id: { in: ids }, churchId, ...contactFilter }, select: donorSelect });
      return { ok: true, recipients: dedupe(rows, channel) };
    }

    case "ALL_DONORS": {
      // "Donor" = someone who has actually given: a successful online
      // payment or a recorded external gift (check, cash…). Someone who only
      // started a checkout, was added by hand, imported or registered for an
      // event is NOT_GIVEN until they do — so these two audiences split
      // everyone on file cleanly with no overlap.
      const [payers, externalGivers] = await Promise.all([
        prisma.payment.findMany({ where: { churchId, status: "SUCCEEDED", donorId: { not: null } }, distinct: ["donorId"], select: { donorId: true }, take: MAX_AUDIENCE }),
        prisma.externalDonation.findMany({ where: { churchId, donorId: { not: null } }, distinct: ["donorId"], select: { donorId: true }, take: MAX_AUDIENCE }),
      ]);
      const ids = [...new Set([...payers, ...externalGivers].map((p) => p.donorId as string))];
      const rows = ids.length ? await prisma.donor.findMany({ where: { churchId, ...activeDonor, id: { in: ids }, ...contactFilter }, select: donorSelect }) : [];
      return { ok: true, recipients: dedupe(rows, channel) };
    }

    case "GIVING_PAGE": {
      if (!req.givingLinkId) return { ok: false, status: 400, error: "Choose a giving page." };
      const link = await prisma.givingLink.findFirst({ where: { id: req.givingLinkId, churchId }, select: { id: true } });
      if (!link) return { ok: false, status: 404, error: "Giving page not found." };
      const payers = await prisma.payment.findMany({
        where: { churchId, givingLinkId: link.id, status: "SUCCEEDED", donorId: { not: null } },
        distinct: ["donorId"],
        select: { donorId: true },
        take: MAX_AUDIENCE,
      });
      const rows = payers.length
        ? await prisma.donor.findMany({ where: { churchId, ...activeDonor, id: { in: payers.map((p) => p.donorId as string) }, ...contactFilter }, select: donorSelect })
        : [];
      return { ok: true, recipients: dedupe(rows, channel) };
    }

    case "IMPORTED_CONTACTS": {
      const rows = await prisma.donor.findMany({ where: { churchId, ...activeDonor, contactSource: "CSV_IMPORT", ...contactFilter }, select: donorSelect, take: MAX_AUDIENCE });
      return { ok: true, recipients: dedupe(rows, channel) };
    }

    case "NOT_GIVEN": {
      const [payers, externalGivers] = await Promise.all([
        prisma.payment.findMany({ where: { churchId, status: "SUCCEEDED", donorId: { not: null } }, distinct: ["donorId"], select: { donorId: true } }),
        prisma.externalDonation.findMany({ where: { churchId, donorId: { not: null } }, distinct: ["donorId"], select: { donorId: true } }),
      ]);
      const gave = new Set([...payers, ...externalGivers].map((p) => p.donorId as string));
      const rows = await prisma.donor.findMany({ where: { churchId, ...activeDonor, ...contactFilter }, select: donorSelect, take: MAX_AUDIENCE });
      return { ok: true, recipients: dedupe(rows.filter((d) => !gave.has(d.id)), channel) };
    }

    case "EVENT": {
      if (channel === "TEXT") return { ok: false, status: 400, error: "Event audiences can only be emailed." };
      if (!req.eventId) return { ok: false, status: 400, error: "Choose an event." };
      const scope: EventAudienceScope = isEventAudienceScope(req.eventScope) ? req.eventScope : "ALL_ATTENDEES";
      const event = await prisma.event.findFirst({ where: { id: req.eventId, churchId }, select: { id: true } });
      if (!event) return { ok: false, status: 404, error: "Event not found." };
      const people = await loadEventAudience(churchId, event.id, scope);
      return {
        ok: true,
        recipients: people.slice(0, MAX_AUDIENCE).map((p) => ({ donorId: p.donorId, email: p.email, phone: null, name: p.name })),
      };
    }
  }
}

/** The audience for a campaign: resolved from this church's own data, minus anyone who unsubscribed (email only). */
export async function resolveCampaignAudience(churchId: string, req: AudienceRequest, channel: "EMAIL" | "TEXT"): Promise<AudienceResult> {
  const result = await resolveRawAudience(churchId, req, channel);
  if (!result.ok || channel !== "EMAIL") return result;
  const optedOut = await loadOptedOutEmails(churchId, result.recipients.map((r) => r.email));
  if (optedOut.size === 0) return result;
  return { ok: true, recipients: result.recipients.filter((r) => !(r.email && optedOut.has(normalizeEmail(r.email) ?? ""))) };
}
