import { prisma } from "@/lib/prisma";
import { hashApiKey } from "@/lib/api/keyHashing";
import { isApiScope, type ApiScope } from "@/lib/api/scopes";
import { checkApiRateLimit, API_RATE_LIMIT_PER_MINUTE } from "@/lib/api/apiRateLimit";
import { ApiAuthError } from "@/lib/api/apiAuthErrors";

export interface ApiAuthContext {
  apiKeyId: string;
  churchId: string;
  scopes: ApiScope[];
  rateLimitRemaining: number;
}

/**
 * Authenticates an /api/v1 request: extracts the Bearer key, hashes and
 * looks it up, checks it's ACTIVE, checks the rate limit, and records
 * lastUsedAt. Throws ApiAuthError (never a raw Error) so every route can
 * catch it uniformly and map straight to the structured apiError() shape.
 * Never trusts a churchId from the request itself — it always comes from
 * the authenticated key's own row, so cross-tenant access is structurally
 * impossible regardless of what a caller passes in a query param or body.
 */
export async function authenticateApiRequest(req: Request): Promise<ApiAuthContext> {
  const authHeader = req.headers.get("authorization");
  const match = /^Bearer\s+(wgc_live_\S+)$/.exec(authHeader ?? "");
  if (!match) {
    throw new ApiAuthError("authentication_error", "Missing or malformed Authorization header. Expected: Bearer wgc_live_...");
  }

  const hashedKey = hashApiKey(match[1]);
  const apiKey = await prisma.apiKey.findUnique({ where: { hashedKey } });
  if (!apiKey || apiKey.status !== "ACTIVE") {
    throw new ApiAuthError("authentication_error", "Invalid or revoked API key.");
  }

  const { allowed, remaining } = checkApiRateLimit(apiKey.id);
  if (!allowed) {
    throw new ApiAuthError("rate_limit_error", `Rate limit exceeded (${API_RATE_LIMIT_PER_MINUTE} requests/minute per key).`);
  }

  // Fire-and-forget — a slow/failed lastUsedAt write must never block or
  // fail the actual API request.
  prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

  const scopes = Array.isArray(apiKey.scopesJson) ? (apiKey.scopesJson as string[]).filter(isApiScope) : [];
  return { apiKeyId: apiKey.id, churchId: apiKey.churchId, scopes, rateLimitRemaining: remaining };
}

export function requireScope(auth: ApiAuthContext, scope: ApiScope): void {
  if (!auth.scopes.includes(scope)) {
    throw new ApiAuthError("authorization_error", `This API key does not have the required scope: ${scope}`);
  }
}
