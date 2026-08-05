import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";
import { resolveWgcAdminBillingPermissions } from "@/lib/auth/billingAdminPermissions";
import { reconcileWgcSubscriptions } from "@/lib/billing/subscriptionReconciliation";

/** Admin-triggered "Reconcile now" — same underlying function the cron
 * job calls, so behavior is identical (idempotent, never creates a new
 * charge/subscription, flags critical issues rather than repairing them). */
export async function POST() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { permissionsJson: true } });
  const perms = resolveWgcAdminBillingPermissions(session.role, user?.permissionsJson);
  if (!perms.canViewBilling) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const result = await reconcileWgcSubscriptions();
  return NextResponse.json({ success: true, ...result });
}
