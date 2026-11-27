/**
 * After a payment on the embeddable giving page, a giving link can send the donor on to a page of the merchant's own
 * (its "success return URL"), carrying the payment's transfer id so that page can confirm the payment with WGC.
 *
 * This only ever happens for hosts on an allow-list, so saving a return URL on a link never changes what any other
 * organization's donors see. The list is the fundraising scorecard's own hosts, plus any in GIVING_SUCCESS_REDIRECT_HOSTS
 * (comma separated).
 */
const DEFAULT_HOSTS = ["fund.wgcpayments.com", "fund.wgcpaymentssandbox.com"];

export function successRedirectHosts(): string[] {
  const extra = (process.env.GIVING_SUCCESS_REDIRECT_HOSTS || "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...DEFAULT_HOSTS, ...extra])];
}

/** The link's return URL when it may be used (https, an allowed host), else null. The transfer id is added by the caller. */
export function allowedSuccessReturnUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    return successRedirectHosts().includes(u.hostname.toLowerCase()) ? u.toString() : null;
  } catch {
    return null;
  }
}

/** The address to send the donor to: the return URL with `transfer_id` added. Null when there is no transfer id to carry. */
export function successReturnTarget(returnUrl: string | null | undefined, transferId: string | null | undefined): string | null {
  const base = allowedSuccessReturnUrl(returnUrl);
  if (!base || !transferId || !/^[A-Za-z0-9]{6,60}$/.test(transferId)) return null;
  const u = new URL(base);
  u.searchParams.set("transfer_id", transferId);
  return u.toString();
}
