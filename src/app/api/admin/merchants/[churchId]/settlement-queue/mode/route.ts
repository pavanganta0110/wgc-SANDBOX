import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";
import { finixClient } from "@/lib/finix/client";
import { logDashboardAction } from "@/lib/dashboardAudit";

const VALID_MODES = new Set(["MANUAL", "UNSET"]);

/**
 * Sets this merchant's Finix settlement_queue_mode. wgc_super_admin only —
 * same privilege tier as impersonate/route.ts (holding funds out of
 * settlement is a platform-level control over a merchant's money, not a
 * routine support action). Requires Finix support to have already enabled
 * the Settlement Queue feature at the Application level; until then this
 * call may error or silently no-op (see FinixClient.updateMerchant).
 */
export async function POST(req: Request, { params }: { params: Promise<{ churchId: string }> }) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "wgc_super_admin") {
    return NextResponse.json({ error: "Only WGC super admins can change a merchant's settlement queue mode." }, { status: 403 });
  }

  const { churchId } = await params;
  const body = await req.json();
  const mode = typeof body.mode === "string" ? body.mode : "";
  if (!VALID_MODES.has(mode)) {
    return NextResponse.json({ error: "mode must be MANUAL or UNSET" }, { status: 400 });
  }

  const church = await prisma.church.findUnique({ where: { id: churchId }, select: { id: true, finixMerchantId: true } });
  if (!church?.finixMerchantId) {
    return NextResponse.json({ error: "This organization has no Finix merchant on file." }, { status: 404 });
  }

  try {
    await finixClient.updateMerchant(church.finixMerchantId, { settlement_queue_mode: mode });
  } catch (err) {
    const message = err instanceof Error ? err.message : undefined;
    return NextResponse.json(
      { error: message || "Finix rejected the settlement_queue_mode change — confirm Settlement Queue is enabled for this Application." },
      { status: 502 }
    );
  }

  await logDashboardAction({
    churchId: church.id,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "settlement_queue.mode_changed",
    entityType: "merchant",
    entityId: church.finixMerchantId,
    metadata: { mode },
    req,
  });

  return NextResponse.json({ success: true, settlementQueueMode: mode });
}
