import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";
import { resolveWgcAdminBillingPermissions } from "@/lib/auth/billingAdminPermissions";

/** Per-organization grant history for a single Promotion template. */
export async function GET(req: Request, { params }: { params: Promise<{ promotionId: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { permissionsJson: true } });
  const perms = resolveWgcAdminBillingPermissions(session.role, user?.permissionsJson);
  if (!perms.canViewBilling) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { promotionId } = await params;
  const entitlements = await prisma.promotionEntitlement.findMany({
    where: { promotionId },
    orderBy: { createdAt: "desc" },
  });

  const orgIds = [...new Set(entitlements.map((e) => e.organizationId))];
  const churches = await prisma.church.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } });
  const nameByOrg = new Map(churches.map((c) => [c.id, c.name]));

  const rows = entitlements.map((e) => ({ ...e, organizationName: nameByOrg.get(e.organizationId) || null }));

  return NextResponse.json({ entitlements: rows });
}
