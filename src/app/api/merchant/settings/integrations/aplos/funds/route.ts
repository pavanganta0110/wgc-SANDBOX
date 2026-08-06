import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/permissions";
import { fetchChurchFunds } from "@/lib/integrations/aplos/resourceService";

/**
 * Read-only Aplos Fund list — display/context only (a Purpose's own
 * `fund` field already carries this; see funds.ts's doc comment). Created
 * because Aplos documents a real, distinct GET /funds endpoint (confirmed
 * from official docs), matching the approved instruction to only add this
 * route when it corresponds to a documented capability.
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

  const result = await fetchChurchFunds(auth.churchId);
  if (!result.success) {
    return NextResponse.json({ error: result.normalized.safeMessage, category: result.normalized.category }, { status: 502 });
  }

  return NextResponse.json({
    funds: result.data.map((f) => ({ id: f.id, name: f.name })),
  });
}
