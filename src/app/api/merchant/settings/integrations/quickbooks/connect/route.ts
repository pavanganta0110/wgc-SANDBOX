import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/permissions";
import { buildAuthorizeUrl, generateOAuthState } from "@/lib/integrations/quickbooks/service";
import { isQuickBooksIntegrationConfigured } from "@/lib/integrations/quickbooks/config";

const STATE_COOKIE = "wgc_qbo_oauth_state";
const CHURCH_COOKIE = "wgc_qbo_oauth_church";
const STATE_COOKIE_MAX_AGE_SECONDS = 10 * 60; // the OAuth round trip to Intuit and back should take seconds, not minutes

/**
 * Step 1 of the OAuth flow — redirects the merchant's browser to Intuit's
 * consent screen. A random `state` value is generated and stored in a
 * short-lived, httpOnly cookie alongside the acting church's id so the
 * callback route can verify the redirect actually belongs to this same
 * browser session (CSRF protection) without needing a server-side session
 * store for OAuth state.
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

  if (!isQuickBooksIntegrationConfigured()) {
    return NextResponse.json({ error: "QuickBooks is not yet configured for this environment. Contact WGC support." }, { status: 400 });
  }

  const state = generateOAuthState();
  const authorizeUrl = await buildAuthorizeUrl(state);

  const cookieStore = await cookies();
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: STATE_COOKIE_MAX_AGE_SECONDS,
    path: "/",
  };
  cookieStore.set(STATE_COOKIE, state, cookieOptions);
  cookieStore.set(CHURCH_COOKIE, auth.churchId, cookieOptions);

  return NextResponse.redirect(authorizeUrl);
}
