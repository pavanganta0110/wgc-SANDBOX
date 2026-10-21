/**
 * Filter helpers for the admin Merchants directory (/admin/merchants and /api/admin/merchants).
 * Kept pure so the date semantics (inclusive end day) and the name-vs-any search rule are unit tested.
 */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export interface ParsedDateRange {
  /** Inclusive lower bound. */
  start: Date | null;
  /** Exclusive upper bound (the day AFTER the chosen end day), so the whole end day is included. */
  endExclusive: Date | null;
  error: string | null;
}

function parseOne(raw: string | null): { date: Date | null; dateOnly: boolean; invalid: boolean } {
  if (!raw) return { date: null, dateOnly: false, invalid: false };
  const dateOnly = DATE_ONLY.test(raw);
  const d = dateOnly ? new Date(`${raw}T00:00:00.000Z`) : new Date(raw);
  return Number.isNaN(d.getTime()) ? { date: null, dateOnly, invalid: true } : { date: d, dateOnly, invalid: false };
}

/**
 * Parses createdDateStart / createdDateEnd. A date-only end ("2026-10-08") means the END OF THAT DAY, so the range
 * is inclusive (previously `<= midnight` silently excluded the whole end day). Full timestamps are used as given.
 */
export function parseCreatedDateRange(start: string | null, end: string | null): ParsedDateRange {
  const s = parseOne(start);
  const e = parseOne(end);
  if (s.invalid || e.invalid) return { start: null, endExclusive: null, error: "Invalid date filter." };
  let endExclusive: Date | null = null;
  if (e.date) {
    endExclusive = new Date(e.date);
    if (e.dateOnly) endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    else endExclusive = new Date(e.date.getTime() + 1); // a precise timestamp stays inclusive
  }
  if (s.date && endExclusive && s.date >= endExclusive) return { start: null, endExclusive: null, error: "The start date must be before the end date." };
  return { start: s.date, endExclusive, error: null };
}

export type MerchantSearchField = "name" | "any";

/** "name" searches only the merchant's own name; anything else keeps the original broad search (name, owner, email, id, giving pages). */
export function parseSearchField(raw: string | null): MerchantSearchField {
  return raw === "name" ? "name" : "any";
}
