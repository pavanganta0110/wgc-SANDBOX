import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";
import { resolveWgcAdminBillingPermissions } from "@/lib/auth/billingAdminPermissions";

const PAGE_SIZE = 50;

/**
 * Read-only list of failed WGC-billing-merchant charges. Retries are
 * Finix/webhook-driven — there is deliberately no retry/mutate action here.
 */
export async function GET(req: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { permissionsJson: true } });
  const perms = resolveWgcAdminBillingPermissions(session.role, user?.permissionsJson);
  if (!perms.canViewBilling) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);

  const [charges, total] = await Promise.all([
    prisma.billingCharge.findMany({
      where: { status: "FAILED" },
      orderBy: { attemptedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.billingCharge.count({ where: { status: "FAILED" } }),
  ]);

  const orgIds = [...new Set(charges.map((c) => c.organizationId))];
  const churches = await prisma.church.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } });
  const nameByOrg = new Map(churches.map((c) => [c.id, c.name]));

  const rows = charges.map((c) => ({ ...c, organizationName: nameByOrg.get(c.organizationId) || null }));

  return NextResponse.json({ charges: rows, page, pageSize: PAGE_SIZE, total });
}
