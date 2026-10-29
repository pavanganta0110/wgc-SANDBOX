/**
 * Which partner sites may show WGC's merchant pages inside an iframe. Read
 * from EMBED_PARTNER_FRAME_ANCESTORS (comma or space separated origins) and
 * applied only to the merchant dashboard and onboarding routes — everything
 * else keeps frame-ancestors 'self'. With the variable unset, nothing changes.
 *
 * Every entry is validated, because the value lands in a Content-Security-Policy
 * header: only https origins (http only for localhost outside production), no
 * path/query, and a "*." wildcard host only when at least two labels follow it,
 * so a typo can never widen the policy to "*" or a whole TLD.
 */

export interface FrameAncestorParseResult {
  /** Normalized, deduplicated origins safe to place in frame-ancestors. */
  origins: string[];
  /** Entries that were dropped, so callers can warn about a misconfiguration. */
  rejected: string[];
}

function isLocalhostHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function normalizeOrigin(entry: string, allowLocalHttp: boolean): string | null {
  // Reject anything that could break out of the directive or isn't a plain origin.
  if (/[;,\s'"]/.test(entry)) return null;

  const wildcard = entry.match(/^https:\/\/\*\.(.+)$/);
  if (wildcard) {
    // "https://*.leadconnectorhq.com" is fine; "https://*.com" or "https://*." is not.
    let parsed: URL;
    try {
      parsed = new URL(`https://${wildcard[1]}`);
    } catch {
      return null;
    }
    const hasPathQueryOrHash = parsed.pathname !== "/" || parsed.search !== "" || parsed.hash !== "";
    if (hasPathQueryOrHash || !parsed.hostname.includes(".") || parsed.username || parsed.password) return null;
    return `https://*.${parsed.host}`;
  }

  // A URL parser accepts "*" in a hostname, so any wildcard that wasn't the
  // one allowed "*.host.tld" form above must be refused here.
  if (entry.includes("*")) return null;

  let url: URL;
  try {
    url = new URL(entry);
  } catch {
    return null;
  }
  if (url.username || url.password || url.pathname !== "/" || url.search !== "" || url.hash !== "") return null;

  if (url.protocol === "https:") return url.origin;
  if (url.protocol === "http:" && allowLocalHttp && isLocalhostHost(url.hostname)) return url.origin;
  return null;
}

export function parseFrameAncestorOrigins(raw: string | undefined, nodeEnv: string | undefined = process.env.NODE_ENV): FrameAncestorParseResult {
  const allowLocalHttp = nodeEnv !== "production";
  const origins: string[] = [];
  const rejected: string[] = [];

  for (const entry of (raw ?? "").split(/[\s,]+/).filter(Boolean)) {
    const origin = normalizeOrigin(entry, allowLocalHttp);
    if (!origin) rejected.push(entry);
    else if (!origins.includes(origin)) origins.push(origin);
  }
  return { origins, rejected };
}

/** The frame-ancestors directive for a partner-framable route: WGC itself plus the allowed partners. */
export function partnerFrameAncestorsDirective(origins: string[]): string {
  return ["frame-ancestors 'self'", ...origins].join(" ");
}
