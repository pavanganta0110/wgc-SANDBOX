import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";
import { resolveWgcAdminBillingPermissions } from "@/lib/auth/billingAdminPermissions";
import MonitoringClient from "./MonitoringClient";

/** Read-only billing monitoring view — a separate page from
 * /admin/billing so it doesn't collide with concurrent edits to the main
 * dashboard. Same permission gate as every other admin billing route
 * (canViewBilling); the actual data fetch happens client-side against
 * /api/admin/billing/monitoring, which re-checks this same gate. */
export default async function BillingMonitoringPage() {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { permissionsJson: true } });
  const perms = resolveWgcAdminBillingPermissions(session.role, user?.permissionsJson);
  if (!perms.canViewBilling) {
    redirect("/admin/billing");
  }

  return <MonitoringClient />;
}
