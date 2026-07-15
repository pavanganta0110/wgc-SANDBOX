// "unknown" shows up as a literal stored value on some synced identities
// (confirmed against real donor records, e.g. a buyer identity with
// last_name "Unknown") — filtered as a placeholder token, same as the
// others, rather than displayed as if it were a real name component.
const JUNK_TOKENS = new Set(["nan", "undefined", "null", "unknown"]);

function isJunk(value: string | null | undefined) {
  if (!value) return true;
  return JUNK_TOKENS.has(String(value).trim().toLowerCase());
}

/**
 * Donor.name is a single free-text field (no separate first/last columns),
 * so "duplicated" names like "kan kan" happen when someone types the same
 * word into it twice, not from concatenating two different name sources —
 * donor name and card/account holder name are already kept strictly
 * separate everywhere they're displayed (donor name wins, cardholder name
 * is only ever a fallback when no donor name exists, never both at once).
 * This just dedupes repeated words within the one field and filters
 * placeholder junk values.
 */
export function formatPersonName(rawName: string | null | undefined, fallbackName?: string | null): string {
  const words = (rawName ?? "")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0 && !isJunk(w));

  const uniqueWords = [...new Set(words.map((w) => w.toLowerCase()))].map(
    (lower) => words.find((w) => w.toLowerCase() === lower)!
  );

  if (uniqueWords.length > 0) return uniqueWords.join(" ");
  if (!isJunk(fallbackName)) return fallbackName!.trim();
  return "—";
}
