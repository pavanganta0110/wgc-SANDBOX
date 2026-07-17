/**
 * Normalizes a hostname for comparison: strips protocol, "www.", port, and
 * trailing slash/path. Used both when an admin saves their allowed-domains
 * list and when checking an incoming Referer against it, so "https://
 * www.church.org/give" and "church.org" saved in settings are treated as
 * the same domain.
 */
export function normalizeEmbedDomain(input: string): string {
  let value = input.trim().toLowerCase();
  if (!value) return "";
  value = value.replace(/^https?:\/\//, "");
  value = value.split("/")[0];
  value = value.split(":")[0];
  value = value.replace(/^www\./, "");
  return value;
}

/**
 * Server-side check: is this embedding page's Referer an approved domain
 * for this organization? Only enforced when the organization has opted
 * into domain restriction (embedDomainRestrictionEnabled) — otherwise the
 * embed works on any site with zero setup, per the feature's design goal.
 */
export function isEmbedOriginAllowed(referer: string | null, allowedDomains: string[]): boolean {
  if (!referer) return false;
  let refererHost: string;
  try {
    refererHost = normalizeEmbedDomain(new URL(referer).hostname);
  } catch {
    return false;
  }
  const normalizedAllowed = allowedDomains.map(normalizeEmbedDomain).filter(Boolean);
  return normalizedAllowed.includes(refererHost);
}

export function parseEmbedAllowedDomains(json: unknown): string[] {
  if (!Array.isArray(json)) return [];
  return json.filter((d): d is string => typeof d === "string");
}
