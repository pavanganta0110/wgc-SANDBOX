import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/permissions";
import { fetchChurchPurposes } from "@/lib/integrations/aplos/resourceService";

/**
 * Read-only Aplos Purpose list for the fund-mapping UI. Requires
 * canManageIntegrations (retrieving live Aplos data is a configuration
 * action, matching the approved spec's route requirements) and a CONNECTED
 * connection — enforced inside resourceService.ts's getReadyConnectionToken,
 * never by trusting a client-supplied flag. churchId always from the
 * authenticated session.
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

  const result = await fetchChurchPurposes(auth.churchId);
  if (!result.success) {
    return NextResponse.json({ error: result.normalized.safeMessage, category: result.normalized.category }, { status: 502 });
  }

  // Only safe display fields — never the raw Aplos envelope.
  return NextResponse.json({
    purposes: result.data.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description ?? null,
      isEnabled: p.is_enabled,
      fund: p.fund ? { id: p.fund.id, name: p.fund.name } : null,
    })),
  });
}
