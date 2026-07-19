import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getSettingsPermissions } from "@/lib/settings/settingsPermissions";

const PAGE_SIZE = 25;

export async function GET(req: Request) {
  const session = await getSession();

  // Team-access Checkpoint 4A: explicit wgc_admin rejection — this route passes
  // session.role into a permission module that has its own wgc_admin branch
  // (for legitimate internal-support use via getSession() elsewhere); without
  // this guard, a wgc_admin session could be admitted here through that back
  // door. requireMerchantSession() (not yet adopted by this route) would
  // reject this unconditionally; this is the minimal-diff equivalent.
  if (session?.role === "wgc_admin") {
    return NextResponse.json({ error: "This route is not available to internal accounts." }, { status: 403 });
  }
  const permissions = getSettingsPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canViewAudit) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);

  const [logs, total] = await Promise.all([
    prisma.dashboardAuditLog.findMany({
      where: { churchId: session.churchId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.dashboardAuditLog.count({ where: { churchId: session.churchId } }),
  ]);

  return NextResponse.json({ logs, total, page, pageSize: PAGE_SIZE });
}
