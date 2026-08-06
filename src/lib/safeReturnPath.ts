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

/**
 * Broader same-origin check for the merchant login flow's `?next=` param —
 * any internal /merchant/* or /activate-subscription/* path is safe to
 * redirect to post-login (still same-origin-only, still no open redirect;
 * just not restricted to the small billing-page allowlist above, since
 * login can legitimately be reached from anywhere in the merchant app).
 */
export function resolveSafeMerchantRedirect(next: string | null | undefined, fallback = "/merchant/dashboard"): string {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  if (next.startsWith("/merchant/") || next.startsWith("/activate-subscription/")) return next;
  return fallback;
}
