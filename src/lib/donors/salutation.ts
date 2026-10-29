export const SALUTATION_MAX_LENGTH = 40;

/**
 * A mailing-list salutation ("Mr. and Mrs.") as typed on a public giving page:
 * trimmed, whitespace collapsed, control characters dropped, cut to
 * SALUTATION_MAX_LENGTH. Anything that isn't text, or ends up empty, is null.
 */
export function cleanSalutation(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, SALUTATION_MAX_LENGTH).trim();
  return cleaned.length > 0 ? cleaned : null;
}
