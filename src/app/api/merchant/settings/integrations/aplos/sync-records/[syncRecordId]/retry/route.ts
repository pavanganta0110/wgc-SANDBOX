import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/permissions";
import { requestManualRetry } from "@/lib/integrations/aplos/syncEngine";

/**
 * Manual "Retry" action for a merchant-visible FAILED or BLOCKED sync
 * record. requestManualRetry() itself enforces the one rule this action
 * must never bypass: a NEEDS_REVIEW / requiresManualReview record is always
 * refused here, per docs/integrations/aplos.md section 7's mandatory
 * ambiguous-result policy — this route has no override for that.
 */
export async function POST(req: Request, context: { params: Promise<{ syncRecordId: string }> }) {
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

  const { syncRecordId } = await context.params;

  try {
    const result = await requestManualRetry(auth.churchId, syncRecordId);
    return NextResponse.json({ outcome: result.outcome, safeMessage: result.safeMessage });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to retry this sync.";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
