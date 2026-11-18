/**
 * The organization's own wording for the automatic auction emails. Pure functions, no database in them.
 *
 * An organization can change the subject and add a short message of its own near the top of each email. The
 * essential part of every email (the amounts, the pay button, the sign-in code) is fixed, so a typo in someone's
 * wording can never break how a winner pays. The sign-in code email is not customizable at all.
 */

export const EMAIL_KINDS = ["approved", "declined", "outbid", "winner", "nextBidderOffer"] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number];

export interface EmailKindInfo {
  kind: EmailKind;
  label: string;
  when: string;
  defaultSubject: string;
  /** The merge fields that mean something in this email. */
  fields: string[];
}

export const EMAIL_KIND_INFO: EmailKindInfo[] = [
  { kind: "approved", label: "Approved to bid", when: "When you approve someone's registration.", defaultSubject: "You're approved to bid in {{auction}}", fields: ["name", "auction", "bidderNumber"] },
  { kind: "declined", label: "Registration not approved", when: "When you decline someone's registration.", defaultSubject: "About your registration for {{auction}}", fields: ["name", "auction"] },
  { kind: "outbid", label: "Outbid", when: "When someone bids higher than them.", defaultSubject: "You've been outbid on {{item}}", fields: ["name", "auction", "item", "amount"] },
  { kind: "winner", label: "You won (with the pay link)", when: "When the auction closes and they won.", defaultSubject: "You won! Pay for your items from {{auction}}", fields: ["name", "auction"] },
  { kind: "nextBidderOffer", label: "Offered to the next bidder", when: "When the top bidder didn't pay in time.", defaultSubject: "An item from {{auction}} is yours if you want it", fields: ["name", "auction", "item", "amount"] },
];

export interface EmailOverride {
  subject?: string;
  intro?: string;
}

export type EmailSettings = Partial<Record<EmailKind, EmailOverride>> & { lastAnnouncementAt?: string };

const MAX_SUBJECT = 150;
const MAX_INTRO = 2000;

/** Cleans what an organization typed. Anything unknown is dropped; empty values mean "use the standard wording". */
export function parseEmailSettings(input: unknown): EmailSettings {
  const out: EmailSettings = {};
  if (!input || typeof input !== "object") return out;
  const source = input as Record<string, unknown>;
  for (const kind of EMAIL_KINDS) {
    const raw = source[kind];
    if (!raw || typeof raw !== "object") continue;
    const { subject, intro } = raw as Record<string, unknown>;
    const entry: EmailOverride = {};
    if (typeof subject === "string" && subject.trim()) entry.subject = subject.trim().replace(/[\r\n]+/g, " ").slice(0, MAX_SUBJECT);
    if (typeof intro === "string" && intro.trim()) entry.intro = intro.trim().slice(0, MAX_INTRO);
    if (entry.subject || entry.intro) out[kind] = entry;
  }
  if (typeof source.lastAnnouncementAt === "string" && !Number.isNaN(new Date(source.lastAnnouncementAt).getTime())) out.lastAnnouncementAt = source.lastAnnouncementAt;
  return out;
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Replaces {{name}}-style fields. A field with no value, or an unknown one, is left out rather than shown as code. */
export function fillFields(template: string, values: Record<string, string | number | null | undefined>): string {
  return template.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (_, key: string) => {
    const value = values[key];
    return value === null || value === undefined ? "" : String(value);
  });
}

/** The subject to send: the organization's wording if it has any, otherwise the standard one. */
export function subjectFor(kind: EmailKind, settings: EmailSettings, values: Record<string, string | number | null | undefined>): string {
  const info = EMAIL_KIND_INFO.find((k) => k.kind === kind)!;
  const subject = fillFields(settings[kind]?.subject ?? info.defaultSubject, values).replace(/\s+/g, " ").trim();
  return subject || fillFields(info.defaultSubject, values);
}

/** The organization's own message as safe HTML (its text is escaped; line breaks are kept), or an empty string. */
export function introHtmlFor(kind: EmailKind, settings: EmailSettings, values: Record<string, string | number | null | undefined>): string {
  const intro = settings[kind]?.intro;
  if (!intro) return "";
  const text = escapeHtml(fillFields(intro, values)).replace(/\r?\n/g, "<br>");
  return `<p>${text}</p>`;
}

export type AnnouncementAudience = "ALL" | "APPROVED" | "WAITING";

export const ANNOUNCEMENT_COOLDOWN_MS = 10 * 60_000;
export const ANNOUNCEMENT_MAX_RECIPIENTS = 1000;

export function audienceStatuses(audience: AnnouncementAudience): string[] {
  if (audience === "APPROVED") return ["APPROVED"];
  if (audience === "WAITING") return ["PENDING"];
  return ["APPROVED", "PENDING"]; // everyone who is not declined or blocked
}

/** When another announcement may be sent, or null if it may go now. Stops a double click from emailing everyone twice. */
export function announcementWaitMs(settings: EmailSettings, now: Date): number | null {
  if (!settings.lastAnnouncementAt) return null;
  const wait = new Date(settings.lastAnnouncementAt).getTime() + ANNOUNCEMENT_COOLDOWN_MS - now.getTime();
  return wait > 0 ? wait : null;
}
