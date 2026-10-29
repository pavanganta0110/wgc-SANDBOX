import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkApiRateLimit, API_RATE_LIMIT_PER_MINUTE } from "@/lib/api/apiRateLimit";
import { ApiAuthError } from "@/lib/api/apiAuthErrors";
import { apiError, generateRequestId } from "@/lib/api/response";
import { hashPartnerApiKey } from "./partnerApiKeys";

export interface PartnerApiAuthContext {
  partnerKeyId: string;
  /** From the authenticated key's own row — never from the request. */
  partnerId: string;
}

/**
 * Authenticates a /api/v1/partner request: Bearer `wgc_ptr_…` key, hashed and
 * looked up, key ACTIVE, partner ACTIVE, rate limited. The partner always comes
 * from the key, so which organizations a caller can see is decided here and
 * never by anything in the query string or body.
 */
export async function authenticatePartnerApiRequest(req: Request): Promise<PartnerApiAuthContext> {
  const match = /^Bearer\s+(wgc_ptr_\S+)$/.exec(req.headers.get("authorization") ?? "");
  if (!match) {
    throw new ApiAuthError("authentication_error", "Missing or malformed Authorization header. Expected: Bearer wgc_ptr_...");
  }

  const key = await prisma.partnerApiKey.findUnique({
    where: { hashedKey: hashPartnerApiKey(match[1]) },
    select: { id: true, partnerId: true, status: true, partner: { select: { status: true } } },
  });
  if (!key || key.status !== "ACTIVE" || key.partner.status !== "ACTIVE") {
    throw new ApiAuthError("authentication_error", "Invalid or revoked API key.");
  }

  const { allowed } = checkApiRateLimit(key.id);
  if (!allowed) {
    throw new ApiAuthError("rate_limit_error", `Rate limit exceeded (${API_RATE_LIMIT_PER_MINUTE} requests/minute per key).`);
  }

  // Fire-and-forget: bookkeeping must never slow or fail the request.
  prisma.partnerApiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date(), requestCount: { increment: 1 } } })
    .catch(() => {});

  return { partnerKeyId: key.id, partnerId: key.partnerId };
}

/** Counts an error response against the key, for the partner's health view. Never throws. */
function recordKeyError(partnerKeyId: string): void {
  prisma.partnerApiKey
    .update({ where: { id: partnerKeyId }, data: { errorCount: { increment: 1 }, lastErrorAt: new Date() } })
    .catch(() => {});
}

/** Same shape as withApiAuth, for the read-only partner API. */
export function withPartnerApiAuth(handler: (req: Request, auth: PartnerApiAuthContext, requestId: string) => Promise<NextResponse>) {
  return async (req: Request): Promise<NextResponse> => {
    const requestId = generateRequestId();
    let auth: PartnerApiAuthContext | null = null;
    try {
      auth = await authenticatePartnerApiRequest(req);
      const res = await handler(req, auth, requestId);
      res.headers.set("X-Request-Id", requestId);
      // The key was accepted, so an error here is something the partner will want to see.
      if (res.status >= 400) recordKeyError(auth.partnerKeyId);
      return res;
    } catch (err) {
      if (err instanceof ApiAuthError) return apiError(err.type, err.message, requestId);
      console.error(`Unhandled /api/v1/partner error [${requestId}]:`, err);
      if (auth) recordKeyError(auth.partnerKeyId);
      return apiError("internal_error", "An unexpected error occurred.", requestId);
    }
  };
}
