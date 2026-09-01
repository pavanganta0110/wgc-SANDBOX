import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/permissions";
import { testExistingQuickBooksConnection } from "@/lib/integrations/quickbooks/service";

/** Returns {success:false} with HTTP 200 on a failed test — this is a
 * user-facing diagnostic action, not a hard server error, matching the
 * Printful test route's convention. */
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

  const result = await testExistingQuickBooksConnection(auth.churchId);
  return NextResponse.json({ success: result.ok, message: result.message });
}
