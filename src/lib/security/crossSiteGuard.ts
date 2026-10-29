/**
 * Browsers label every request with Sec-Fetch-Site. A state-changing request to
 * the merchant API that the browser says came from a DIFFERENT SITE is never
 * legitimate: the dashboard calls this API from its own pages (same-origin), and
 * an embedded dashboard is still WGC's own page making same-origin calls. Refusing
 * cross-site writes is the CSRF backstop for the embedded-session cookie, which
 * has to be SameSite=None so a cross-site iframe can send it.
 */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isCrossSiteStateChange(method: string, secFetchSite: string | null): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return false;
  return secFetchSite === "cross-site";
}
