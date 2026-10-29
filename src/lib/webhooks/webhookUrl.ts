/**
 * A webhook URL a partner may register: https, and not an address that points
 * back into our own network. This stops the obvious cases (localhost, private
 * and link-local addresses written as literals, internal-looking names). It does
 * not resolve DNS, so it is not a complete defence against a hostname that
 * resolves to a private address.
 */
export function isAllowedPartnerWebhookUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2000) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  // Local development only, so a developer can point the webhook at a receiver on
  // their own machine. Ignored in production whatever the variable says.
  if (process.env.NODE_ENV !== "production" && process.env.PARTNER_WEBHOOK_ALLOW_LOCAL === "1") {
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password;
  }
  if (url.protocol !== "https:" || url.username || url.password) return false;

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host.includes(".") && !host.includes(":")) return false; // "localhost", single-label internal names
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost")) return false;

  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
  }
  if (host.includes(":")) {
    // IPv6 literal: loopback, unique-local, link-local, v4-mapped
    if (host === "::1" || host === "::" || /^f[cd]/.test(host) || /^fe[89ab]/.test(host) || host.startsWith("::ffff:")) return false;
  }
  return true;
}
