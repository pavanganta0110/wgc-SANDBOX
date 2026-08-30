import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/auth/session";
import { SESSION_COOKIE_NAME } from "@/lib/auth/sessionConstants";
import { IMPERSONATION_COOKIE_NAME, clearImpersonationCookie, endImpersonationSession } from "@/lib/auth/impersonation";
import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";

/**
 * Ends the current "View as Merchant" impersonation session. Only ever
 * touches the wgc_impersonation cookie/row — never the admin's own
 * wgc_session cookie, so the admin is never logged out by exiting merchant
 * view. Idempotent: if no valid impersonation cookie is present at all
 * (already ended/expired/cleared), this still returns 200 with the same
 * redirect rather than erroring.
 */
export async function POST(req: Request) {
  const cookieStore = await cookies();

  // Read the impersonation cookie directly (not via resolveActiveImpersonation)
  // so exiting still works even in the edge case where the admin's own
  // session is right at its own expiry boundary — this route's only job is
  // to end the impersonation row and clear its cookie, not to re-validate
  // the admin's broader session.
  const impersonationToken = cookieStore.get(IMPERSONATION_COOKIE_NAME)?.value;
  let targetChurchId: string | null = null;

  if (impersonationToken) {
    const [payloadB64] = impersonationToken.split(".");
    try {
      const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
      const impersonationSessionId: string | undefined = payload?.impersonationSessionId;
      if (impersonationSessionId) {
        const dbSession = await prisma.adminImpersonationSession.findUnique({ where: { id: impersonationSessionId } });
        if (dbSession) {
          targetChurchId = dbSession.targetChurchId;
          await endImpersonationSession(impersonationSessionId, "manual_exit");

          // Prefer the real admin session for accurate audit attribution
          // when available; fall back to the impersonation row's own
          // snapshot (adminUserId/adminEmail) if the admin's session
          // cookie is itself no longer verifiable at this exact moment.
          const adminToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
          const adminPayload = adminToken ? verifySessionToken(adminToken) : null;

          await logDashboardAction({
            churchId: dbSession.targetChurchId,
            actorUserId: adminPayload?.userId ?? dbSession.adminUserId,
            actorEmail: adminPayload?.email ?? dbSession.adminEmail,
            actorRole: adminPayload?.role ?? "wgc_admin",
            action: "ADMIN_IMPERSONATION_ENDED",
            metadata: { impersonationSessionId },
            req,
          });
        }
      }
    } catch {
      // Malformed/unsignable cookie — nothing to end, fall through to clear+redirect.
    }
  }

  await clearImpersonationCookie();

  return NextResponse.json({
    redirectTo: targetChurchId ? `/admin/merchants/${targetChurchId}` : "/admin/merchants",
  });
}
