import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";
import { resolveWgcAdminBillingPermissions } from "@/lib/auth/billingAdminPermissions";

/** Admin → Billing & Subscriptions → Promo Compliance. Read-only list of
 * PromoShortfallCharge rows (default: just the ones awaiting a decision) —
 * charging/waiving is done via the [id]/charge and [id]/waive routes. */
export async function GET(req: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { permissionsJson: true } });
  const perms = resolveWgcAdminBillingPermissions(session.role, user?.permissionsJson);
  if (!perms.canViewBilling) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get("status");

  const shortfalls = await prisma.promoShortfallCharge.findMany({
    where: statusFilter ? { status: statusFilter } : { status: "FLAGGED" },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const orgIds = Array.from(new Set(shortfalls.map((s) => s.organizationId)));
  const orgs = orgIds.length ? await prisma.church.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } }) : [];
  const orgNameById = new Map(orgs.map((o) => [o.id, o.name]));

  return NextResponse.json({
    shortfalls: shortfalls.map((s) => ({ ...s, organizationName: orgNameById.get(s.organizationId) || s.organizationId })),
    canManageBilling: perms.canManageBilling,
  });
}
