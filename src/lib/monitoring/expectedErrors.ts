/**
 * Errors that are the app WORKING AS DESIGNED, not problems. They are thrown on purpose to stop a request, and the person
 * already sees the right screen or message for them, so they must not become System Health errors or Sentry issues
 * (they bury the real ones). Matched by name and message so this works on errors that crossed a module boundary.
 */
export function isExpectedGuardrailError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  // The organization's WGC subscription billing isn't finished / is past due / canceled / suspended: the dashboard is
  // intentionally closed and the person is sent to the billing status page.
  if (error.name === "BillingAccessRestrictedError") return true;
  // A WGC staff account opened a merchant page without the support-access flow: intentionally refused.
  if (error.name === "UnauthorizedError" && error.message.startsWith("WGC internal accounts cannot access merchant organization data")) return true;
  return false;
}

/**
 * The route to record: the path only. A query string can carry one-time sign-in codes and tokens (an OAuth callback's
 * `code` and `state`), which must never be stored, and it also split one problem into many separate rows.
 */
export function routeWithoutQuery(path: string): string {
  const cut = path.search(/[?#]/);
  return cut === -1 ? path : path.slice(0, cut);
}
