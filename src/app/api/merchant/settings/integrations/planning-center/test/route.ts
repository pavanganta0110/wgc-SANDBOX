import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/permissions";
import { testExistingPlanningCenterConnection } from "@/lib/integrations/planningcenter/service";

/** Returns {success:false} with HTTP 200 on a failed test — a user-facing
 * diagnostic, not a server error (same convention as the QuickBooks route). */
export async function POST() {
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

  const result = await testExistingPlanningCenterConnection(auth.churchId);
  return NextResponse.json({ success: result.ok, message: result.message });
}
