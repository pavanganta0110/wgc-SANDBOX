import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getSettingsPermissions } from "@/lib/settings/settingsPermissions";
import { logDashboardAction } from "@/lib/dashboardAudit";

const PAGE_SIZE = 25;

export async function GET(req: Request) {
  const session = await getSession();
  const permissions = getSettingsPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canView) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const church = await prisma.church.findUnique({ where: { id: session.churchId }, select: { finixMerchantId: true } });
  if (!church?.finixMerchantId) {
    return NextResponse.json({ events: [], total: 0 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);

  const [events, total] = await Promise.all([
    prisma.finixWebhookEvent.findMany({
      where: { merchantId: church.finixMerchantId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, entity: true, type: true, processingStatus: true, errorMessage: true, createdAt: true, processedAt: true },
    }),
    prisma.finixWebhookEvent.count({ where: { merchantId: church.finixMerchantId } }),
  ]);

  return NextResponse.json({ events, total, page, pageSize: PAGE_SIZE });
}

export async function POST(req: Request) {
  const session = await getSession();
  const permissions = getSettingsPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canTriggerSync) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const church = await prisma.church.findUnique({ where: { id: session.churchId }, select: { finixMerchantId: true } });
  if (!church?.finixMerchantId) {
    return NextResponse.json({ error: "This organization has no linked payment processor account yet" }, { status: 400 });
  }

  try {
    const { syncChurchPricingForChurch } = await import("@/lib/finix/sync/syncFeeProfiles");
    await syncChurchPricingForChurch(session.churchId, church.finixMerchantId);
  } catch (err) {
    console.error("Manual pricing sync failed:", err);
    return NextResponse.json({ error: "Sync failed. Try again shortly." }, { status: 502 });
  }

  await logDashboardAction({
    churchId: session.churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "settings.pricing_sync_triggered",
    entityType: "church",
    entityId: session.churchId,
    req,
  });

  return NextResponse.json({ success: true });
}
