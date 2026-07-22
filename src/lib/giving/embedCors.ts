import { prisma } from "@/lib/prisma";
import { isEmbedOriginAllowed, parseEmbedAllowedDomains } from "@/lib/giving/embedDomainCheck";

/**
 * Shared cross-origin policy for the two public embed endpoints
 * (GET /api/embed/giving-pages/[slug] and POST /api/g/[slug]/donate when
 * called from the wgc-giving.js inline form on a third-party site).
 *
 * Never wildcards Access-Control-Allow-Origin — always echoes back the
 * caller's own Origin (and only when that origin is actually permitted),
 * per the same embedDomainRestrictionEnabled/embedAllowedDomainsJson
 * allowlist already enforced for the iframe-based /embed/[slug] page. When
 * a church hasn't turned on domain restriction, the embed is intentionally
 * open to any origin (matches that feature's existing zero-setup design).
 */

export const EMBED_CORS_ALLOWED_METHODS = "GET, POST, OPTIONS";
export const EMBED_CORS_ALLOWED_HEADERS = "Content-Type";

export async function resolveEmbedCorsOrigin(slug: string, origin: string | null): Promise<string | null> {
  if (!origin) return null;

  const link = await prisma.givingLink.findUnique({ where: { publicSlug: slug }, select: { churchId: true } });
  if (!link) return null;

  const church = await prisma.church.findUnique({
    where: { id: link.churchId },
    select: { embedDomainRestrictionEnabled: true, embedAllowedDomainsJson: true },
  });
  if (!church) return null;

  if (!church.embedDomainRestrictionEnabled) return origin;

  const allowedDomains = parseEmbedAllowedDomains(church.embedAllowedDomainsJson);
  return isEmbedOriginAllowed(origin, allowedDomains) ? origin : null;
}

export function embedCorsHeaders(allowOrigin: string | null): HeadersInit {
  if (!allowOrigin) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    Vary: "Origin",
    "Access-Control-Allow-Methods": EMBED_CORS_ALLOWED_METHODS,
    "Access-Control-Allow-Headers": EMBED_CORS_ALLOWED_HEADERS,
  };
}

export function embedPreflightResponse(allowOrigin: string | null): Response {
  return new Response(null, { status: allowOrigin ? 204 : 403, headers: embedCorsHeaders(allowOrigin) });
}
