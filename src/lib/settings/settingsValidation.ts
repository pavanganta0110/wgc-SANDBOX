const URL_PATTERN = /^https?:\/\/[^\s]+$/i;

/** HTTPS-only in production, rejects javascript: schemes and other unsafe redirects — used for website/terms/privacy/return URLs across Settings. */
export function isValidHttpsUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (!URL_PATTERN.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") return false;
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    return true;
  } catch {
    return false;
  }
}

const IANA_TIMEZONE_ALLOWLIST = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Phoenix",
];

export function isValidTimezone(tz: string | null | undefined): boolean {
  if (!tz) return false;
  return IANA_TIMEZONE_ALLOWLIST.includes(tz);
}

/** Trims and collapses internal whitespace; returns null for an empty result so callers can distinguish "cleared" from "unset". */
export function normalizeWhitespace(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Builds a Prisma update payload that only includes fields explicitly
 * present in the submitted body, and only clears a field when the body
 * explicitly sends an empty string for it — a field simply absent from the
 * body (as opposed to sent-empty) is left untouched, so a partial update
 * never accidentally nulls out a previously-saved value.
 */
export function buildPartialUpdate<T extends Record<string, unknown>>(body: Record<string, unknown>, keys: (keyof T)[]): Partial<T> {
  const update: Partial<T> = {};
  for (const key of keys) {
    if (!(key in body)) continue;
    const raw = body[key as string];
    if (typeof raw === "string") {
      update[key] = (normalizeWhitespace(raw) as any) ?? (null as any);
    } else if (typeof raw === "boolean" || typeof raw === "number" || raw === null) {
      update[key] = raw as any;
    }
  }
  return update;
}
