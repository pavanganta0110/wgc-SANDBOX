import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/permissions";
import { buildAuthorizeUrl, generateOAuthState, generatePkcePair } from "@/lib/integrations/planningcenter/authProvider";
import { isPlanningCenterIntegrationConfigured, isPlanningCenterIntegrationEnabled } from "@/lib/integrations/planningcenter/config";

// Mirrored in ../callback/route.ts — route modules can only export handlers.
const PLANNING_CENTER_STATE_COOKIE = "wgc_pco_oauth_state";
const PLANNING_CENTER_VERIFIER_COOKIE = "wgc_pco_oauth_verifier";
const PLANNING_CENTER_CHURCH_COOKIE = "wgc_pco_oauth_church";
const COOKIE_MAX_AGE_SECONDS = 10 * 60; // the round trip to Planning Center and back takes seconds

/**
 * Step 1 of the OAuth flow — redirects the church admin's browser to
 * Planning Center's consent screen. A random `state`, the PKCE code
 * verifier and the acting church's id are stored in short-lived httpOnly
 * cookies so the callback can verify this redirect belongs to the same
 * browser session. The churchId always comes from the session, never from
 * the request.
 */
export async function GET() {
  let auth;
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

  if (!isPlanningCenterIntegrationEnabled() || !isPlanningCenterIntegrationConfigured()) {
    return NextResponse.json({ error: "Planning Center is not yet configured for this environment. Contact WGC support." }, { status: 400 });
  }

  const state = generateOAuthState();
  const { codeVerifier, codeChallenge } = generatePkcePair();
  const authorizeUrl = buildAuthorizeUrl({ state, codeChallenge });

  const cookieStore = await cookies();
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: COOKIE_MAX_AGE_SECONDS,
    path: "/",
  };
  cookieStore.set(PLANNING_CENTER_STATE_COOKIE, state, cookieOptions);
  cookieStore.set(PLANNING_CENTER_VERIFIER_COOKIE, codeVerifier, cookieOptions);
  cookieStore.set(PLANNING_CENTER_CHURCH_COOKIE, auth.churchId, cookieOptions);

  return NextResponse.redirect(authorizeUrl);
}
