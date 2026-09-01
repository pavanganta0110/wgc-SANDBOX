import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { completeQuickBooksConnection } from "@/lib/integrations/quickbooks/service";
import { QuickBooksConnectionError } from "@/lib/integrations/quickbooks/errors";
import { QuickBooksAuthError } from "@/lib/integrations/quickbooks/authProvider";

const STATE_COOKIE = "wgc_qbo_oauth_state";
const CHURCH_COOKIE = "wgc_qbo_oauth_church";
const SETTINGS_PATH = "/merchant/settings/integrations/quickbooks";

/**
 * Step 2/3 of the OAuth flow — Intuit redirects the merchant's browser
 * here with ?code=...&realmId=...&state=.... Verifies `state` against the
 * cookie set in connect/route.ts (CSRF protection), verifies the acting
 * session's churchId matches the church that started the flow, then
 * exchanges the code for tokens via the service layer. Always redirects
 * back to the settings page (never returns raw JSON) since this is a
 * browser top-level navigation, not an API call the UI fetches.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const realmId = url.searchParams.get("realmId");
  const returnedState = url.searchParams.get("state");
  const intuitError = url.searchParams.get("error");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STATE_COOKIE)?.value;
  const expectedChurchId = cookieStore.get(CHURCH_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);
  cookieStore.delete(CHURCH_COOKIE);

  const fail = (reason: string) => NextResponse.redirect(new URL(`${SETTINGS_PATH}?error=${encodeURIComponent(reason)}`, url.origin));

  if (intuitError) {
    return fail(intuitError === "access_denied" ? "QuickBooks connection was declined." : "QuickBooks returned an error during connection.");
  }
  if (!code || !realmId || !returnedState) {
    return fail("QuickBooks did not return the expected connection details.");
  }
  if (!expectedState || !expectedChurchId || returnedState !== expectedState) {
    return fail("This QuickBooks connection request expired or could not be verified. Please try connecting again.");
  }

  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return fail("Your session expired. Please log in and try connecting QuickBooks again.");
    throw err;
  }

  if (auth.churchId !== expectedChurchId) {
    return fail("This QuickBooks connection request does not match the current organization session.");
  }

  try {
    await completeQuickBooksConnection({
      churchId: auth.churchId,
      code,
      realmId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.role,
      req,
    });
  } catch (err) {
    if (err instanceof QuickBooksConnectionError || err instanceof QuickBooksAuthError) {
      return fail(err.message);
    }
    throw err;
  }

  return NextResponse.redirect(new URL(`${SETTINGS_PATH}?connected=true`, url.origin));
}
