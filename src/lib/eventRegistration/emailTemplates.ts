/**
 * Merchant-customizable copy for the three automated event emails
 * (registration confirmation, reminder, post-event thank-you), plus the
 * merge-field renderer they share. Defaults are deliberately neutral — no
 * organization, event type, or school wording is baked in; every merchant
 * edits their own text in the event's Emails tab.
 */

export type EventEmailKind = "confirmation" | "reminder" | "thankYou";

export interface EventEmailTemplates {
  confirmation: { subject: string; body: string };
  reminder: { enabled: boolean; daysBefore: number; subject: string; body: string };
  thankYou: { enabled: boolean; daysAfter: number; subject: string; body: string };
}

export interface EventEmailContext {
  eventName: string;
  eventDate: string;
  eventTime: string;
  eventLocation: string;
  eventLink: string;
  organizationName: string;
  registrantName: string;
  registrantFirstName: string;
  /** First name of whoever this specific email is addressed to. */
  recipientFirstName: string;
  groupName: string;
  attendeeCount: string;
  confirmationCode: string;
}

export const EVENT_MERGE_FIELDS: { token: string; label: string }[] = [
  { token: "{{recipientFirstName}}", label: "Recipient first name" },
  { token: "{{registrantName}}", label: "Registrant full name" },
  { token: "{{eventName}}", label: "Event name" },
  { token: "{{eventDate}}", label: "Event date" },
  { token: "{{eventTime}}", label: "Event time" },
  { token: "{{eventLocation}}", label: "Event location" },
  { token: "{{eventLink}}", label: "Event page link" },
  { token: "{{organizationName}}", label: "Your organization's name" },
  { token: "{{groupName}}", label: "Team / group name" },
  { token: "{{attendeeCount}}", label: "Number of attendees" },
  { token: "{{confirmationCode}}", label: "Confirmation code" },
];

export const DEFAULT_EVENT_EMAIL_TEMPLATES: EventEmailTemplates = {
  confirmation: {
    subject: "You're registered for {{eventName}}",
    body: "Hi {{recipientFirstName}},\n\nThank you for registering for {{eventName}}. We look forward to seeing you on {{eventDate}} at {{eventTime}}.\n\nWith gratitude,\n{{organizationName}}",
  },
  reminder: {
    enabled: false,
    daysBefore: 7,
    subject: "Reminder: {{eventName}} is coming up",
    body: "Hi {{recipientFirstName}},\n\nThis is a reminder that {{eventName}} is on {{eventDate}} at {{eventTime}}, at {{eventLocation}}.\n\nWe can't wait to see you!\n{{organizationName}}",
  },
  thankYou: {
    enabled: false,
    daysAfter: 1,
    subject: "Thank you for joining us at {{eventName}}",
    body: "Hi {{recipientFirstName}},\n\nThank you for being part of {{eventName}}. Your presence made it special.\n\nWith gratitude,\n{{organizationName}}",
  },
};

const MAX_SUBJECT = 200;
const MAX_BODY = 20000;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function pickText(v: unknown, fallback: string, max: number): string {
  return typeof v === "string" && v.trim() ? v.slice(0, max) : fallback;
}

function pickInt(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

/** Stored JSON merged over the defaults — tolerant of null/partial/malformed values. */
export function parseEmailTemplates(json: unknown): EventEmailTemplates {
  const d = DEFAULT_EVENT_EMAIL_TEMPLATES;
  const j = isRecord(json) ? json : {};
  const c = isRecord(j.confirmation) ? j.confirmation : {};
  const r = isRecord(j.reminder) ? j.reminder : {};
  const t = isRecord(j.thankYou) ? j.thankYou : {};
  return {
    confirmation: {
      subject: pickText(c.subject, d.confirmation.subject, MAX_SUBJECT),
      body: pickText(c.body, d.confirmation.body, MAX_BODY),
    },
    reminder: {
      enabled: r.enabled === true,
      daysBefore: pickInt(r.daysBefore, d.reminder.daysBefore, 0, 60),
      subject: pickText(r.subject, d.reminder.subject, MAX_SUBJECT),
      body: pickText(r.body, d.reminder.body, MAX_BODY),
    },
    thankYou: {
      enabled: t.enabled === true,
      daysAfter: pickInt(t.daysAfter, d.thankYou.daysAfter, 0, 60),
      subject: pickText(t.subject, d.thankYou.subject, MAX_SUBJECT),
      body: pickText(t.body, d.thankYou.body, MAX_BODY),
    },
  };
}

export type TemplatesValidation = { ok: true; templates: EventEmailTemplates } | { ok: false; error: string };

/** Strict validation for the merchant's save — specific errors, never silently coerced. */
export function validateEmailTemplates(input: unknown): TemplatesValidation {
  if (input == null) return { ok: true, templates: DEFAULT_EVENT_EMAIL_TEMPLATES };
  if (!isRecord(input)) return { ok: false, error: "Email templates are invalid." };
  const parsed = parseEmailTemplates(input);
  const sections: [string, string, string][] = [
    ["confirmation", parsed.confirmation.subject, parsed.confirmation.body],
    ["reminder", parsed.reminder.subject, parsed.reminder.body],
    ["thank-you", parsed.thankYou.subject, parsed.thankYou.body],
  ];
  for (const [label, subject, body] of sections) {
    if (!subject.trim() || !body.trim()) return { ok: false, error: `The ${label} email needs a subject and a message.` };
  }
  const r = isRecord(input.reminder) ? input.reminder : {};
  if (r.daysBefore !== undefined && parsed.reminder.daysBefore !== Number(r.daysBefore)) {
    return { ok: false, error: "Reminder days must be a whole number from 0 to 60." };
  }
  const t = isRecord(input.thankYou) ? input.thankYou : {};
  if (t.daysAfter !== undefined && parsed.thankYou.daysAfter !== Number(t.daysAfter)) {
    return { ok: false, error: "Thank-you days must be a whole number from 0 to 60." };
  }
  return { ok: true, templates: parsed };
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const MERGE_PATTERN = /\{\{\s*([A-Za-z]+)\s*\}\}/g;

/** Replaces known {{fields}}; unknown ones are left as typed so a merchant typo is visible in the preview rather than silently blank. */
export function renderEventTemplate(template: string, ctx: EventEmailContext, opts: { html: boolean }): string {
  return template.replace(MERGE_PATTERN, (match, key: string) => {
    if (!(key in ctx)) return match;
    const value = ctx[key as keyof EventEmailContext];
    return opts.html ? escapeHtml(value) : value;
  });
}

/**
 * Minimal defense-in-depth cleanup for merchant-authored HTML. The author is
 * an authenticated organization user writing to their own attendees (and
 * mail clients don't run scripts), so this isn't the primary control — it
 * just strips the obviously dangerous constructs so an email can never ship
 * active content.
 */
export function sanitizeEmailHtml(html: string): string {
  return html
    .replace(/<\s*(script|style|iframe|object|embed|form|link|meta)[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|form|link|meta)\b[^>]*\/?>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '$1="#"');
}

/**
 * Photos in event emails: a merchant adds "[photo: https://…]" on its own
 * line (the Emails tab's Add photo button inserts it). Only https images are
 * turned into <img> tags, after the rest of the text has been rendered and
 * escaped, so a photo link can never smuggle markup in.
 */
const PHOTO_TOKEN = /\[photo:\s*(https:\/\/[^\s\]<>"']+)\s*\]/gi;
const VIDEO_TOKEN = /\[video:\s*(https:\/\/[^\s\]<>"']+)\s*\]/gi;
function renderPhotos(html: string): string {
  // Email can't play video, so a video is a clear "Watch" button to its page.
  html = html.replace(
    VIDEO_TOKEN,
    (_m, url: string) =>
      `<p style="margin:12px 0;"><a href="${url}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:8px;">&#9654; Watch the video</a></p>`
  );
  return html.replace(
    PHOTO_TOKEN,
    (_m, url: string) => `<img src="${url}" alt="" style="display:block;max-width:100%;height:auto;border-radius:8px;margin:8px 0;" />`
  );
}

const HTML_TAG = /<\/?[a-z][\s\S]*?>/i;

/** Plain text becomes escaped paragraphs/line breaks; text containing HTML is sanitized and kept as HTML. */
export function bodyToHtml(body: string, ctx: EventEmailContext): string {
  if (HTML_TAG.test(body)) {
    return renderPhotos(sanitizeEmailHtml(renderEventTemplate(body, ctx, { html: true })));
  }
  const rendered = renderEventTemplate(body, ctx, { html: true });
  return renderPhotos(
    rendered
      .split(/\n{2,}/)
      .map((para) => `<p style="margin: 0 0 16px 0;">${para.replace(/\n/g, "<br/>")}</p>`)
      .join("")
  );
}
