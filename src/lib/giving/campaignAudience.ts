import { prisma } from "@/lib/prisma";
import { isValidEmail, normalizeEmail } from "@/lib/donors/donorContact";
import { isEventAudienceScope, loadEventAudience, type EventAudienceScope } from "@/lib/eventRegistration/audience";

/**
 * Who a Giving Campaign (outbound email/text) is addressed to. The original
 * composer sends to hand-picked donors (SELECTED); this adds audiences that
 * are resolved server-side from the church's own data:
 *
 *  - ALL_DONORS         every active donor with the needed contact info
 *  - GIVING_PAGE        donors who completed a payment through one giving page
 *  - EVENT              an event's attendees/registrants (email only) — read
 *                       from registration rows, so people who registered free
 *                       and never paid are included
 *  - IMPORTED_CONTACTS  contacts added by CSV import (no donation required)
 *
 * Every query is filtered by churchId, and every referenced id (giving page,
 * event) is re-verified to belong to that church. Recipients are
 * de-duplicated by normalized email (or phone for texts).
 */

export const AUDIENCE_SOURCES = ["SELECTED", "ALL_DONORS", "GIVING_PAGE", "EVENT", "IMPORTED_CONTACTS"] as const;
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

export async function resolveCampaignAudience(churchId: string, req: AudienceRequest, channel: "EMAIL" | "TEXT"): Promise<AudienceResult> {
  const contactFilter = channel === "TEXT" ? { normalizedPhone: { not: null } } : { email: { not: null } };

  switch (req.source) {
    case "SELECTED": {
      const ids = (req.donorIds ?? []).filter((id) => typeof id === "string");
      if (ids.length === 0) return { ok: false, status: 400, error: "Select at least one donor." };
      const rows = await prisma.donor.findMany({ where: { id: { in: ids }, churchId, ...contactFilter }, select: donorSelect });
      return { ok: true, recipients: dedupe(rows, channel) };
    }

    case "ALL_DONORS": {
      // "Donor" = someone created by a payment/subscription/external gift
      // (no contactSource), or an imported/event contact who has since
      // actually paid.
      const base = await prisma.donor.findMany({ where: { churchId, ...activeDonor, contactSource: null, ...contactFilter }, select: donorSelect, take: MAX_AUDIENCE });
      const payers = await prisma.payment.findMany({
        where: { churchId, status: "SUCCEEDED", donorId: { not: null } },
        distinct: ["donorId"],
        select: { donorId: true },
        take: MAX_AUDIENCE,
      });
      const baseIds = new Set(base.map((d) => d.id));
      const extraIds = payers.map((p) => p.donorId as string).filter((id) => !baseIds.has(id));
      const extra = extraIds.length
        ? await prisma.donor.findMany({ where: { churchId, ...activeDonor, id: { in: extraIds }, ...contactFilter }, select: donorSelect })
        : [];
      return { ok: true, recipients: dedupe([...base, ...extra], channel) };
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
