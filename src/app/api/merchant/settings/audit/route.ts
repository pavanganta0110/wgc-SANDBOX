import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getSettingsPermissions } from "@/lib/settings/settingsPermissions";

const PAGE_SIZE = 25;

export async function GET(req: Request) {
  const session = await getSession();
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
