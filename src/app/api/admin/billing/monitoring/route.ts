import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";
import { resolveWgcAdminBillingPermissions } from "@/lib/auth/billingAdminPermissions";
import { getBillingMonitoringSnapshot } from "@/lib/billing/billingMonitoring";

/** Read-only billing monitoring signals — surfaces data already produced by
 * subscriptionReconciliation.ts and the webhook ingestion path. No mutation
 * endpoints live here; the existing /api/admin/billing/reconcile route is
 * the one legitimate correction action. */
export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { permissionsJson: true } });
  const perms = resolveWgcAdminBillingPermissions(session.role, user?.permissionsJson);
  if (!perms.canViewBilling) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const snapshot = await getBillingMonitoringSnapshot();
  return NextResponse.json(snapshot);
}
