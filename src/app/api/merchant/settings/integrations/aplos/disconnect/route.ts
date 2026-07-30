import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/permissions";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { prisma } from "@/lib/prisma";
import { disconnectConnection } from "@/lib/integrations/aplos/connectionService";
import { APLOS_AUDIT_EVENTS } from "@/lib/integrations/aplos/auditEvents";

/**
 * Disconnect. Per the approved MVP decision, this deletes the encrypted
 * private key and fingerprints outright (see connectionService.ts's
 * disconnectConnection doc comment) — reconnecting always requires fresh
 * authorization. Preserves the row (status/history) and disables automatic
 * sync. Requires explicit confirmation from the client — the request body
 * must include { confirm: true }, mirroring this codebase's other
 * irreversible-action confirmation pattern rather than treating any POST
 * to this route as sufficient.
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const confirmed = !!(body && typeof body === "object" && (body as Record<string, unknown>).confirm === true);
  if (!confirmed) {
    return NextResponse.json({ error: "Disconnecting requires explicit confirmation." }, { status: 400 });
  }

  const existing = await prisma.aplosConnection.findUnique({ where: { churchId: auth.churchId } });
  if (!existing) {
    return NextResponse.json({ error: "No Aplos connection exists for this organization." }, { status: 404 });
  }

  await disconnectConnection(auth.churchId);

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: APLOS_AUDIT_EVENTS.DISCONNECTED,
    entityType: "AplosConnection",
    metadata: { timestamp: new Date().toISOString() },
    req,
  });

  return NextResponse.json({ success: true, status: "DISCONNECTED" });
}
