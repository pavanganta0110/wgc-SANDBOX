import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/permissions";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { computeSyncEligibility } from "@/lib/integrations/aplos/syncEligibility";
import { APLOS_AUDIT_EVENTS } from "@/lib/integrations/aplos/auditEvents";

/**
 * Enables or disables AplosConnection.automaticSyncEnabled.
 *
 * Enabling is only permitted when computeSyncEligibility() reports fully
 * eligible — the exact rule from the approved spec. Disabling is always
 * permitted (never blocked). No real automatic sync exists yet in this
 * checkpoint (built starting Checkpoint 7) — this route only manages the
 * flag and its eligibility gate.
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
  const enabled = (body as Record<string, unknown> | null)?.enabled;
  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled (boolean) is required." }, { status: 400 });
  }

  if (enabled) {
    const eligibility = await computeSyncEligibility(auth.churchId);
    if (!eligibility.eligible) {
      return NextResponse.json({ error: "Automatic sync cannot be enabled yet.", reasons: eligibility.reasons }, { status: 400 });
    }
  }

  const existing = await prisma.aplosConnection.findUnique({ where: { churchId: auth.churchId } });
  if (!existing) {
    return NextResponse.json({ error: "No Aplos connection exists for this organization." }, { status: 404 });
  }

  await prisma.aplosConnection.update({ where: { churchId: auth.churchId }, data: { automaticSyncEnabled: enabled } });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: enabled ? APLOS_AUDIT_EVENTS.AUTOMATIC_SYNC_ENABLED : APLOS_AUDIT_EVENTS.AUTOMATIC_SYNC_DISABLED,
    entityType: "AplosConnection",
    metadata: { timestamp: new Date().toISOString() },
    req,
  });

  return NextResponse.json({ success: true, automaticSyncEnabled: enabled });
}
