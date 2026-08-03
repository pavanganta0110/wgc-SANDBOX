import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";

// Archiving only hides the client from the default list — every invoice,
// payment, and audit record stays attached and queryable. Nothing here is
// ever hard-deleted.
export async function POST(req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  try {
    requirePermission(auth, "canManageClients");
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const { clientId } = await params;
  const client = await prisma.client.findFirst({ where: { id: clientId, churchId: auth.churchId } });
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }
  if (client.archivedAt) {
    return NextResponse.json({ success: true, alreadyArchived: true });
  }

  await prisma.client.update({
    where: { id: client.id },
    data: { archivedAt: new Date(), archivedByUserId: auth.userId, archivedByEmail: auth.email },
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "client.archived",
    entityType: "client",
    entityId: clientId,
    req,
  });

  return NextResponse.json({ success: true });
}
