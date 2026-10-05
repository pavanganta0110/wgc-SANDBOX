import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";
import { resolveWgcAdminBillingPermissions } from "@/lib/auth/billingAdminPermissions";

/** Admin → Billing → Text Overages. Read-only list of
 * SmsAddonOverageCharge rows (default: just the ones awaiting a decision)
 * — charging/waiving is done via the [id]/charge and [id]/waive routes.
 * Mirrors /api/admin/billing/promo-shortfalls exactly. */
export async function GET(req: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { permissionsJson: true } });
  const perms = resolveWgcAdminBillingPermissions(session.role, user?.permissionsJson);
  if (!perms.canViewBilling) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get("status");

  const overages = await prisma.smsAddonOverageCharge.findMany({
    where: statusFilter ? { status: statusFilter } : { status: "FLAGGED" },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const orgIds = Array.from(new Set(overages.map((o) => o.organizationId)));
  const orgs = orgIds.length ? await prisma.church.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } }) : [];
  const orgNameById = new Map(orgs.map((o) => [o.id, o.name]));

  return NextResponse.json({
    overages: overages.map((o) => ({ ...o, organizationName: orgNameById.get(o.organizationId) || o.organizationId })),
    canManageBilling: perms.canManageBilling,
  });
}
