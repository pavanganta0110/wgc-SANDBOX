import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/permissions";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { saveFundMapping, removeFundMapping, MappingValidationError } from "@/lib/integrations/aplos/mappingService";
import { APLOS_AUDIT_EVENTS } from "@/lib/integrations/aplos/auditEvents";

/**
 * Save (PUT) or remove (DELETE) one WGC Fund -> Aplos Purpose mapping.
 * canManageIntegrations required for both. wgcFundId's ownership by this
 * church is re-verified inside saveFundMapping/removeFundMapping — this
 * route itself only supplies auth.churchId, never trusting any
 * church-identifying value from the request body.
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
  const { wgcFundId, aplosPurposeId, isDefault } = (body ?? {}) as Record<string, unknown>;
  if (typeof wgcFundId !== "string" || wgcFundId.trim() === "") {
    return NextResponse.json({ error: "wgcFundId is required." }, { status: 400 });
  }
  const purposeIdNum = Number(aplosPurposeId);
  if (!Number.isFinite(purposeIdNum)) {
    return NextResponse.json({ error: "A valid aplosPurposeId is required." }, { status: 400 });
  }

  try {
    await saveFundMapping(auth.churchId, wgcFundId, purposeIdNum, isDefault === true);
  } catch (err) {
    if (err instanceof MappingValidationError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    throw err;
  }

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: APLOS_AUDIT_EVENTS.MAPPING_UPDATED,
    entityType: "AplosPurposeMapping",
    entityId: wgcFundId,
    metadata: { aplosPurposeId: purposeIdNum, isDefault: isDefault === true, timestamp: new Date().toISOString() },
    req,
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
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
  const { wgcFundId } = (body ?? {}) as Record<string, unknown>;
  if (typeof wgcFundId !== "string" || wgcFundId.trim() === "") {
    return NextResponse.json({ error: "wgcFundId is required." }, { status: 400 });
  }

  await removeFundMapping(auth.churchId, wgcFundId);

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: APLOS_AUDIT_EVENTS.MAPPING_UPDATED,
    entityType: "AplosPurposeMapping",
    entityId: wgcFundId,
    metadata: { removed: true, timestamp: new Date().toISOString() },
    req,
  });

  return NextResponse.json({ success: true });
}
