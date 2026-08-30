import { logDashboardAction } from "@/lib/dashboardAudit";
import type { MerchantAuthContext } from "./requireMerchantSession";

/**
 * Tags a mutating merchant API request made during an admin "View as
 * Merchant" impersonation session with real-actor attribution, so it is
 * never recorded as if the merchant themselves performed it. No-ops
 * instantly (before touching the DB) for the overwhelming majority of
 * calls — every non-impersonated request — so it's safe to add to any
 * mutating route as a single additive line with no behavior change for
 * normal merchant traffic.
 *
 * v1 scope is deliberately coarse: route + method only, no per-field
 * before/after diffing (that would require touching every mutation's
 * business logic individually rather than one line per route). Never logs
 * request body contents, so card/bank/password data can't leak into audit
 * metadata even by accident.
 *
 * Call this as the first line after requireMerchantSession() in any
 * mutating (non-GET) merchant API route:
 *   const auth = await requireMerchantSession();
 *   await auditImpersonatedWrite(auth, req);
 */
export async function auditImpersonatedWrite(auth: MerchantAuthContext, req: Request): Promise<void> {
  if (!auth.impersonation) return;

  try {
    const url = new URL(req.url);
    await logDashboardAction({
      churchId: auth.churchId,
      actorUserId: auth.impersonation.adminUserId,
      actorEmail: auth.impersonation.adminEmail,
      actorRole: auth.rawRole,
      action: "ADMIN_IMPERSONATION_ACTION",
      metadata: {
        actorType: "PLATFORM_ADMIN",
        actorAdminId: auth.impersonation.adminUserId,
        impersonationSessionId: auth.impersonation.impersonationSessionId,
        route: url.pathname,
        method: req.method,
      },
      req,
    });
  } catch (err) {
    // Audit logging must never break the write it's observing.
    console.error("Failed to log impersonated write:", err);
  }
}
