import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/permissions";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { revalidateSavedConfiguration } from "@/lib/integrations/aplos/accountConfigurationService";
import { APLOS_AUDIT_EVENTS } from "@/lib/integrations/aplos/auditEvents";

/**
 * "Refresh resources" — re-checks the saved deposit account, expense
 * account, and default Purpose against Aplos's CURRENT resources. Never
 * silently replaces a stale/missing selection (per the approved spec) —
 * only reports validity and, when something is now invalid, disables
 * automatic sync and records why, requiring the merchant to explicitly
 * re-select and re-save.
 */
export async function POST(req: Request) {
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

  const result = await revalidateSavedConfiguration(auth.churchId);
  if (!result) {
    return NextResponse.json({ error: "No account configuration has been saved yet." }, { status: 404 });
  }

  const allValid = result.depositAccountValid && result.processingFeeExpenseAccountValid && result.defaultPurposeValid;

  if (!allValid) {
    // Disable automatic sync rather than leaving it on with a now-invalid
    // configuration — never lets sync eligibility silently drift stale.
    await prisma.aplosConnection.updateMany({
      where: { churchId: auth.churchId, automaticSyncEnabled: true },
      data: { automaticSyncEnabled: false, lastErrorAt: new Date(), lastErrorCode: "INVALID_CONFIGURATION", lastErrorMessage: result.errors.join(" ") },
    });
    await logDashboardAction({
      churchId: auth.churchId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.rawRole,
      action: APLOS_AUDIT_EVENTS.RESOURCE_INVALIDATED,
      entityType: "AplosAccountConfiguration",
      metadata: { errors: result.errors, timestamp: new Date().toISOString() },
      req,
    });
  }

  return NextResponse.json({ ...result, lastValidatedAt: new Date().toISOString() });
}
