/**
 * Validates a returnTo query parameter against an explicit allowlist of
 * internal application paths — never allows an open redirect to an
 * external site. Anything not exactly matching a known-safe path (or its
 * subpaths, for the two entries that need them) falls back to the given
 * default.
 */
const ALLOWED_RETURN_PATHS = ["/test-billing-form", "/merchant/subscription", "/merchant/dashboard"];
// Prefixes for routes with a dynamic segment (e.g. the token in
// /activate-subscription/[token]) — still same-origin-only, still no open
// redirect, just can't be listed as an exact string.
const ALLOWED_RETURN_PREFIXES = ["/activate-subscription/"];

export function resolveSafeReturnPath(returnTo: string | null | undefined, fallback = "/test-billing-form"): string {
  if (!returnTo) return fallback;
  // Reject anything that isn't a same-origin absolute path — no protocol,
  // no "//" (protocol-relative), no backslashes (some browsers treat them
  // as forward slashes, a classic open-redirect bypass).
  if (!returnTo.startsWith("/") || returnTo.startsWith("//") || returnTo.includes("\\")) return fallback;
  if (ALLOWED_RETURN_PATHS.includes(returnTo)) return returnTo;
  if (ALLOWED_RETURN_PREFIXES.some((prefix) => returnTo.startsWith(prefix) && returnTo.length > prefix.length)) return returnTo;
  return fallback;
}
