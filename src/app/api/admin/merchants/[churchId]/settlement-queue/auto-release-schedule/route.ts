import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";
import { logDashboardAction } from "@/lib/dashboardAudit";

/**
 * Sets which weekdays (0=Sunday..6=Saturday) /api/cron/release-settlement-queue
 * should auto-release this merchant's ready queue entries on. wgc_super_admin
 * only, same tier as mode/route.ts and release/route.ts — this schedule is
 * what makes future releases happen unattended, so it carries the same
 * weight as releasing funds directly.
 */
export async function POST(req: Request, { params }: { params: Promise<{ churchId: string }> }) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "wgc_super_admin") {
    return NextResponse.json({ error: "Only WGC super admins can change a merchant's auto-release schedule." }, { status: 403 });
  }

  const { churchId } = await params;
  const body = await req.json();
  const weekdays = Array.isArray(body.weekdays) ? body.weekdays : null;
  if (
    !weekdays ||
    !weekdays.every((d: unknown) => typeof d === "number" && Number.isInteger(d) && d >= 0 && d <= 6) ||
    new Set(weekdays).size !== weekdays.length
  ) {
    return NextResponse.json({ error: "weekdays must be an array of unique integers 0-6" }, { status: 400 });
  }

  const church = await prisma.church.findUnique({ where: { id: churchId }, select: { id: true, finixMerchantId: true } });
  if (!church) {
    return NextResponse.json({ error: "Organization not found." }, { status: 404 });
  }

  await prisma.church.update({
    where: { id: churchId },
    data: { settlementAutoReleaseWeekdays: weekdays },
  });

  await logDashboardAction({
    churchId: church.id,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "settlement_queue.auto_release_schedule_changed",
    entityType: "merchant",
    entityId: church.finixMerchantId || church.id,
    metadata: { weekdays },
    req,
  });

  return NextResponse.json({ success: true, autoReleaseWeekdays: weekdays });
}
