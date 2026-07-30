import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/permissions";
import { requestManualRetry } from "@/lib/integrations/aplos/syncEngine";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { APLOS_AUDIT_EVENTS } from "@/lib/integrations/aplos/auditEvents";

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

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: APLOS_AUDIT_EVENTS.MANUAL_RETRY_REQUESTED,
    entityType: "AplosSyncRecord",
    entityId: syncRecordId,
    req,
  });

  try {
    const result = await requestManualRetry(auth.churchId, syncRecordId);
    return NextResponse.json({ outcome: result.outcome, safeMessage: result.safeMessage });
  } catch (err) {
    // requestManualRetry only ever throws these two fixed, merchant-safe
    // messages itself (see syncEngine.ts) — anything else is an unexpected
    // internal error (e.g. a credential-decryption or Prisma error) and
    // must never be relayed verbatim, since it can name internal
    // configuration or schema details. Logged server-side instead.
    const KNOWN_SAFE_MESSAGES = ["Sync record not found for this organization.", "Sync record has no associated settlement."];
    const message = err instanceof Error && KNOWN_SAFE_MESSAGES.includes(err.message) ? err.message : "Unable to retry this sync.";
    if (message === "Unable to retry this sync.") {
      console.error(`Aplos manual retry failed for church ${auth.churchId}, syncRecord ${syncRecordId}:`, err);
    }
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
