import { NextResponse, after } from "next/server";
import { cookies } from "next/headers";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/permissions";
import { completePlanningCenterConnection } from "@/lib/integrations/planningcenter/service";
import { autoSetupAfterConnect } from "@/lib/integrations/planningcenter/autoSetup";
import { PlanningCenterAuthError, PlanningCenterConnectionError } from "@/lib/integrations/planningcenter/errors";

// Duplicated from ../connect/route.ts on purpose: a Next.js route module may
// only export HTTP handlers, so shared constants can't be imported from it.
const STATE_COOKIE = "wgc_pco_oauth_state";
const VERIFIER_COOKIE = "wgc_pco_oauth_verifier";
const CHURCH_COOKIE = "wgc_pco_oauth_church";
const SETTINGS_PATH = "/merchant/settings/integrations/planning-center";

/**
 * Step 2/3 of the OAuth flow — Planning Center redirects here with
 * ?code=...&state=.... Verifies `state` against the cookie from connect/
 * (CSRF), verifies the session's church matches the church that started the
 * flow, then exchanges the code. Always redirects back to the settings page
 * (never raw JSON) since this is a top-level browser navigation.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STATE_COOKIE)?.value;
  const codeVerifier = cookieStore.get(VERIFIER_COOKIE)?.value;
  const expectedChurchId = cookieStore.get(CHURCH_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);
  cookieStore.delete(VERIFIER_COOKIE);
  cookieStore.delete(CHURCH_COOKIE);

  const fail = (reason: string) => NextResponse.redirect(new URL(`${SETTINGS_PATH}?error=${encodeURIComponent(reason)}`, url.origin));

  if (oauthError) {
    return fail(oauthError === "access_denied" ? "Planning Center connection was declined." : "Planning Center returned an error during connection.");
  }
  if (!code || !returnedState) {
    return fail("Planning Center did not return the expected connection details.");
  }
  if (!expectedState || !codeVerifier || !expectedChurchId || returnedState !== expectedState) {
    return fail("This Planning Center connection request expired or could not be verified. Please try connecting again.");
  }

  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return fail("Your session expired. Please log in and try connecting Planning Center again.");
    throw err;
  }

  try {
    requirePermission(auth, "canManageIntegrations");
  } catch (err) {
    if (err instanceof ForbiddenError) return fail("You don't have permission to manage integrations.");
    throw err;
  }

  if (auth.churchId !== expectedChurchId) {
    return fail("This Planning Center connection request does not match the current organization session.");
  }

  try {
    await completePlanningCenterConnection({
      churchId: auth.churchId,
      code,
      codeVerifier,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.role,
      req,
    });
  } catch (err) {
    if (err instanceof PlanningCenterConnectionError || err instanceof PlanningCenterAuthError) {
      return fail(err.message);
    }
    throw err;
  }

  // "Connect, and that's all": set up the payment source, funds and sync after the redirect, so the church isn't kept
  // waiting. Best effort: if anything stops it, the Giving setup panel shows exactly what's left.
  const actor = { userId: auth.userId, email: auth.email, role: auth.role };
  const setUp = async () => {
    try {
      await autoSetupAfterConnect(auth.churchId, actor);
    } catch (err) {
      console.error("planning-center: automatic setup failed:", err instanceof Error ? err.message : err);
    }
  };
  try {
    after(setUp);
  } catch {
    void setUp();
  }

  return NextResponse.redirect(new URL(`${SETTINGS_PATH}?connected=true`, url.origin));
}
