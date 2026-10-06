import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { appOrigin } from "@/lib/eventRegistration/eventConfig";

/**
 * Per-attendee tickets. The ticket "barcode" is a QR code that encodes the
 * attendee's unguessable ticketToken. The token alone is the credential: it
 * is only ever resolved server-side, scoped to the scanning merchant's own
 * church and event, and it grants nothing except "this person is expected".
 */

/** Prefix on the QR payload so the scanner can tell a ticket from any other QR code. */
export const TICKET_QR_PREFIX = "WGC-TKT:";

export function generateTicketToken(): string {
  return crypto.randomBytes(18).toString("base64url");
}

export function ticketPageUrl(token: string): string {
  return `${appOrigin()}/ticket/${token}`;
}

/** Public PNG of the QR — an <img> URL because mail clients block data: images. */
export function ticketQrImageUrl(token: string): string {
  return `${appOrigin()}/api/ticket/${token}/qr`;
}

export function encodeTicketPayload(token: string): string {
  return `${TICKET_QR_PREFIX}${token}`;
}

/** Accepts the raw QR text, a pasted ticket URL, or a bare token. Returns null when it isn't plausibly a ticket. */
export function parseTicketPayload(raw: string): string | null {
  let value = (raw ?? "").trim();
  if (!value) return null;
  if (value.startsWith(TICKET_QR_PREFIX)) value = value.slice(TICKET_QR_PREFIX.length);
  else {
    const m = value.match(/\/ticket\/([A-Za-z0-9_-]+)\/?(?:[?#].*)?$/);
    if (m) value = m[1];
  }
  return /^[A-Za-z0-9_-]{16,64}$/.test(value) ? value : null;
}

/**
 * Makes sure every attendee of a registration has a token (attendees that
 * predate tickets don't). Idempotent and race-safe: only fills rows that
 * are still null, so a concurrent caller can't overwrite a token already
 * sent in an email.
 */
export async function ensureTicketTokens(registrationId: string, churchId: string) {
  const attendees = await prisma.eventAttendee.findMany({ where: { registrationId, churchId }, orderBy: { createdAt: "asc" } });
  const missing = attendees.filter((a) => !a.ticketToken);
  if (missing.length === 0) return attendees;
  for (const a of missing) {
    await prisma.eventAttendee.updateMany({ where: { id: a.id, ticketToken: null }, data: { ticketToken: generateTicketToken() } });
  }
  return prisma.eventAttendee.findMany({ where: { registrationId, churchId }, orderBy: { createdAt: "asc" } });
}

export type ScanOutcome = "CHECKED_IN" | "ALREADY_CHECKED_IN" | "NOT_FOUND" | "NOT_CONFIRMED" | "WRONG_EVENT";

export interface ScanResult {
  outcome: ScanOutcome;
  attendee?: { id: string; firstName: string; lastName: string; groupName: string | null; confirmationCode: string; checkedInAt: string | null };
}

/**
 * Check an attendee in by ticket token for one church's event. The
 * unchecked -> checked transition is claimed atomically, so two scanners
 * reading the same ticket at once can't both report a first entry.
 */
export async function checkInByTicket(args: { churchId: string; eventId: string; token: string; userId: string | null }): Promise<ScanResult> {
  const { churchId, eventId, token, userId } = args;
  // churchId in the lookup: another organization's ticket reads as unknown.
  const attendee = await prisma.eventAttendee.findFirst({ where: { ticketToken: token, churchId } });
  if (!attendee) return { outcome: "NOT_FOUND" };

  const registration = await prisma.eventRegistration.findFirst({ where: { id: attendee.registrationId, churchId } });
  const shape = (checkedInAt: Date | null) => ({
    id: attendee.id,
    firstName: attendee.firstName,
    lastName: attendee.lastName,
    groupName: registration?.groupName ?? null,
    confirmationCode: registration?.confirmationCode ?? "",
    checkedInAt: checkedInAt?.toISOString() ?? null,
  });

  if (attendee.eventId !== eventId) return { outcome: "WRONG_EVENT", attendee: shape(attendee.checkedInAt) };
  if (!registration || registration.status !== "CONFIRMED") return { outcome: "NOT_CONFIRMED", attendee: shape(attendee.checkedInAt) };

  const now = new Date();
  const claimed = await prisma.eventAttendee.updateMany({
    where: { id: attendee.id, churchId, checkedIn: false },
    data: { checkedIn: true, checkedInAt: now, checkedInByUserId: userId },
  });
  if (claimed.count === 1) return { outcome: "CHECKED_IN", attendee: shape(now) };

  const fresh = await prisma.eventAttendee.findFirst({ where: { id: attendee.id, churchId }, select: { checkedInAt: true } });
  return { outcome: "ALREADY_CHECKED_IN", attendee: shape(fresh?.checkedInAt ?? attendee.checkedInAt) };
}
