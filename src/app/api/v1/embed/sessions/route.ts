import { withApiAuth } from "@/lib/api/withApiAuth";
import { apiError, apiSuccess } from "@/lib/api/response";
import { createEmbedLoginToken, EmbedLoginError } from "@/lib/auth/embedLogin";
import { isValidEmail } from "@/lib/donors/donorContact";
import { resolveSafeMerchantRedirect } from "@/lib/safeReturnPath";
import { logDashboardAction } from "@/lib/dashboardAudit";

/**
 * Starts an embedded login for one named staff member of the key's own
 * organization. Returns a one-time link, good for about a minute, that the
 * partner opens in its iframe. See src/lib/auth/embedLogin.ts for the rules
 * (which roles, no MFA users, single use). The church always comes from the key.
 */
export const POST = withApiAuth("embed:sessions", async (req, auth, requestId) => {
  let body: { email?: unknown; redirectTo?: unknown };
  try {
    body = await req.json();
  } catch {
    return apiError("validation_error", "Send a JSON body with the staff member's `email`.", requestId);
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!isValidEmail(email)) {
    return apiError("validation_error", "`email` must be a valid email address.", requestId);
  }
  const redirectTo =
    typeof body.redirectTo === "string" && body.redirectTo ? resolveSafeMerchantRedirect(body.redirectTo, "/merchant/dashboard") : "/merchant/dashboard";

  try {
    const { token, expiresAt, userId } = await createEmbedLoginToken({ churchId: auth.churchId, email, redirectTo, apiKeyId: auth.apiKeyId });

    await logDashboardAction({
      churchId: auth.churchId,
      actorUserId: userId,
      actorEmail: email,
      actorRole: "api_key",
      action: "auth.embed_login_requested",
      entityType: "user",
      entityId: userId,
      metadata: { apiKeyId: auth.apiKeyId, redirectTo },
      req,
    });

    const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
    return apiSuccess({ url: `${origin}/merchant/embed/enter?token=${token}`, expiresAt: expiresAt.toISOString() }, requestId);
  } catch (err) {
    if (err instanceof EmbedLoginError) {
      if (err.code === "user_not_found") return apiError("not_found_error", err.message, requestId, { code: err.code });
      return apiError("authorization_error", err.message, requestId, { code: err.code });
    }
    throw err;
  }
});
