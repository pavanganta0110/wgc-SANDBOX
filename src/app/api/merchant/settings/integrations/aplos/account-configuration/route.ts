import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/permissions";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { saveAccountConfiguration, ConfigurationValidationError } from "@/lib/integrations/aplos/accountConfigurationService";
import { APLOS_AUDIT_EVENTS } from "@/lib/integrations/aplos/auditEvents";

/**
 * Saves the deposit account, processing-fee expense account, and default
 * Purpose. Every ID is revalidated server-side against Aplos immediately
 * before saving (accountConfigurationService.ts) — this route cannot be
 * used to persist an arbitrary, unverified ID.
 */
export async function PUT(req: Request) {
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { depositAccountId, processingFeeExpenseAccountId, defaultPurposeId } = (body ?? {}) as Record<string, unknown>;
  const depositNum = Number(depositAccountId);
  const expenseNum = Number(processingFeeExpenseAccountId);
  const purposeNum = Number(defaultPurposeId);
  if (!Number.isFinite(depositNum) || !Number.isFinite(expenseNum) || !Number.isFinite(purposeNum)) {
    return NextResponse.json({ error: "depositAccountId, processingFeeExpenseAccountId, and defaultPurposeId are all required." }, { status: 400 });
  }

  try {
    await saveAccountConfiguration(auth.churchId, {
      depositAccountId: depositNum,
      processingFeeExpenseAccountId: expenseNum,
      defaultPurposeId: purposeNum,
    });
  } catch (err) {
    if (err instanceof ConfigurationValidationError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    throw err;
  }

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: APLOS_AUDIT_EVENTS.CONFIGURATION_UPDATED,
    entityType: "AplosAccountConfiguration",
    metadata: { timestamp: new Date().toISOString() },
    req,
  });

  return NextResponse.json({ success: true });
}
