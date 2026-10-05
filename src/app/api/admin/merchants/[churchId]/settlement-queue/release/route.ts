import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";
import { finixClient } from "@/lib/finix/client";
import { logDashboardAction } from "@/lib/dashboardAudit";

/**
 * Releases one or more Settlement Queue Entries for this merchant (single
 * or bulk). wgc_super_admin only — this moves real money into a
 * Settlement. Finix rejects an entry released before its own
 * ready_to_settle_at date with "Unable to Release Entries." — that message
 * is surfaced as-is rather than replaced with a generic failure, since it
 * tells the admin exactly what to do (wait and retry).
 */
export async function POST(req: Request, { params }: { params: Promise<{ churchId: string }> }) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "wgc_super_admin") {
    return NextResponse.json({ error: "Only WGC super admins can release settlement queue entries." }, { status: 403 });
  }

  const { churchId } = await params;
  const body = await req.json();
  const ids = Array.isArray(body.ids) ? body.ids.filter((id: unknown) => typeof id === "string" && id.length > 0) : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "ids must be a non-empty array of settlement_queue_entry ids" }, { status: 400 });
  }

  const church = await prisma.church.findUnique({ where: { id: churchId }, select: { id: true, finixMerchantId: true } });
  if (!church?.finixMerchantId) {
    return NextResponse.json({ error: "This organization has no Finix merchant on file." }, { status: 404 });
  }

  // Ownership check: every id must actually belong to this merchant before
  // we ask Finix to release it — settlement_queue_entries has no merchant
  // segment in its URL, so nothing else stops a request crafted against
  // this route (right churchId, wrong ids) from releasing another
  // organization's funds.
  const listed = await finixClient.listSettlementQueueEntries({ merchantId: church.finixMerchantId });
  const ownedIds = new Set(
    ((listed._embedded?.settlement_queue_entries ?? []) as Array<{ id: string }>).map((e) => e.id)
  );
  const foreignIds = ids.filter((id: string) => !ownedIds.has(id));
  if (foreignIds.length > 0) {
    return NextResponse.json({ error: "One or more entries do not belong to this organization." }, { status: 403 });
  }

  try {
    const result = await finixClient.releaseSettlementQueueEntries(ids);
    await logDashboardAction({
      churchId: church.id,
      actorUserId: session.userId,
      actorEmail: session.email,
      actorRole: session.role,
      action: "settlement_queue.entries_released",
      entityType: "merchant",
      entityId: church.finixMerchantId,
      metadata: { ids },
      req,
    });
    return NextResponse.json({ success: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : undefined;
    return NextResponse.json({ error: message || "Failed to release settlement queue entries." }, { status: 502 });
  }
}
