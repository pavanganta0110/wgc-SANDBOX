import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/permissions";
import { isPlanningCenterIntegrationEnabled } from "./config";
import { PlanningCenterApiError, PlanningCenterAuthError, PlanningCenterConnectionError, PlanningCenterSetupError } from "./errors";

type Session = Awaited<ReturnType<typeof requireMerchantSession>>;

/**
 * Shared guard for every Planning Center management route: resolves the
 * church from the SESSION (never from the request), requires
 * `canManageIntegrations`, honors the integration kill switch, and maps the
 * integration's own error types onto clean JSON responses. Keeps each route
 * handler down to its actual work.
 */
export async function runAsIntegrationsManager(handler: (auth: Session) => Promise<NextResponse>): Promise<NextResponse> {
  let auth: Session;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  try {
    requirePermission(auth, "canManageIntegrations");
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  if (!isPlanningCenterIntegrationEnabled()) {
    return NextResponse.json({ error: "Planning Center is not available in this environment." }, { status: 404 });
  }

  try {
    return await handler(auth);
  } catch (err) {
    return planningCenterErrorResponse(err);
  }
}

export function planningCenterErrorResponse(err: unknown): NextResponse {
  if (err instanceof PlanningCenterSetupError) return NextResponse.json({ error: err.message }, { status: 400 });
  if (err instanceof PlanningCenterConnectionError) return NextResponse.json({ error: err.message, code: "NOT_CONNECTED" }, { status: 409 });
  if (err instanceof PlanningCenterApiError || err instanceof PlanningCenterAuthError) {
    const n = err.normalized;
    const status = n.category === "ACCESS_DENIED" ? 403 : n.category === "RATE_LIMITED" ? 429 : n.retryable ? 503 : 502;
    return NextResponse.json({ error: n.safeMessage, code: n.category }, { status });
  }
  throw err;
}

/** Parses and validates a JSON body. Returns the data, or a ready-made 400 response. */
export async function parseJsonBody<T>(req: Request, schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false } }): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, response: NextResponse.json({ error: "Invalid request." }, { status: 400 }) };
  return { ok: true, data: parsed.data };
}
