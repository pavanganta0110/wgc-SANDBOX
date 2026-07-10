import crypto from "crypto";

/**
 * Validates a church-supplied return/failure/cancel URL. Rejects anything
 * that isn't a well-formed https:// URL (http allowed only outside
 * production for local testing) — this is the redirect target we build
 * result-page links against, so an open scheme like javascript: or a
 * malformed value here is a direct XSS/open-redirect vector.
 */
export function isValidReturnUrl(url: string | null | undefined): boolean {
  if (!url) return true; // empty is fine — falls back to the default WGC result page
  try {
    const parsed = new URL(url);
    if (process.env.NODE_ENV === "production") {
      return parsed.protocol === "https:";
    }
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Appends only safe, non-sensitive result parameters to a church-supplied
 * return URL — never processor IDs, donor PII, or payment instrument data.
 */
export function appendSafeResultParams(
  baseUrl: string,
  params: { status: string; confirmationRef?: string; amountCents?: number; givingLinkPublicId?: string }
): string {
  const url = new URL(baseUrl);
  url.searchParams.set("status", params.status);
  if (params.confirmationRef) url.searchParams.set("confirmation", params.confirmationRef);
  if (params.amountCents != null) url.searchParams.set("amount", String(params.amountCents));
  if (params.givingLinkPublicId) url.searchParams.set("link", params.givingLinkPublicId);
  return url.toString();
}

export function generatePublicSlug(): string {
  return crypto.randomBytes(9).toString("base64url");
}
