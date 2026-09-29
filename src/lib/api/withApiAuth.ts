import { NextResponse } from "next/server";
import { generateRequestId, apiError } from "@/lib/api/response";
import { authenticateApiRequest, requireScope, type ApiAuthContext } from "@/lib/api/apiAuth";
import { ApiAuthError } from "@/lib/api/apiAuthErrors";
import { logApiRequest } from "@/lib/api/logApiRequest";
import type { ApiScope } from "@/lib/api/scopes";

/**
 * Shared boilerplate for every /api/v1 route: authenticate the key, check
 * its scope, generate a request id, log the outcome, and normalize any
 * thrown error into the structured apiError() shape. Individual routes
 * only implement the actual business logic. Generic over Next.js's own
 * dynamic-route `{ params }` context so routes like /api/v1/donors/[id]
 * get their params the normal Next.js way, not by re-parsing the URL.
 */
// Next.js's generated route-type validator calls every route handler
// (including ones with no dynamic segments) with a context object of this
// shape — the default here matches that so a plain collection route (no
// generic argument given) type-checks against Next's own expectations
// without every handler needing to declare a context parameter it ignores.
type EmptyRouteContext = { params: Promise<Record<string, never>> };

export function withApiAuth<Context = EmptyRouteContext>(
  requiredScope: ApiScope,
  handler: (req: Request, auth: ApiAuthContext, requestId: string, context: Context) => Promise<NextResponse>
) {
  return async (req: Request, context: Context): Promise<NextResponse> => {
    const requestId = generateRequestId();
    const startedAt = Date.now();
    let auth: ApiAuthContext | null = null;
    try {
      auth = await authenticateApiRequest(req);
      requireScope(auth, requiredScope);
      const res = await handler(req, auth, requestId, context);
      logApiRequest({
        apiKeyId: auth.apiKeyId,
        churchId: auth.churchId,
        method: req.method,
        path: new URL(req.url).pathname,
        statusCode: res.status,
        requestId,
        idempotencyKey: req.headers.get("idempotency-key"),
        durationMs: Date.now() - startedAt,
      });
      res.headers.set("X-Request-Id", requestId);
      return res;
    } catch (err) {
      if (err instanceof ApiAuthError) {
        if (auth) {
          logApiRequest({ apiKeyId: auth.apiKeyId, churchId: auth.churchId, method: req.method, path: new URL(req.url).pathname, statusCode: 403, requestId, durationMs: Date.now() - startedAt });
        }
        return apiError(err.type, err.message, requestId);
      }
      console.error(`Unhandled /api/v1 error [${requestId}]:`, err);
      return apiError("internal_error", "An unexpected error occurred.", requestId);
    }
  };
}
