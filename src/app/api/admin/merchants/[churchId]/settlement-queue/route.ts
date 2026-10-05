import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";
import { finixClient } from "@/lib/finix/client";

/**
 * Current settlement_queue_mode for this merchant, plus every pending
 * (unreleased) Settlement Queue Entry. Read access matches the rest of the
 * admin panel — both admin tiers can view; only wgc_super_admin can act
 * (see mode/route.ts and release/route.ts).
 */
export async function GET(req: Request, { params }: { params: Promise<{ churchId: string }> }) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { churchId } = await params;
  const church = await prisma.church.findUnique({
    where: { id: churchId },
    select: { finixMerchantId: true, settlementAutoReleaseWeekdays: true },
  });
  if (!church?.finixMerchantId) {
    return NextResponse.json({ error: "This organization has no Finix merchant on file." }, { status: 404 });
  }

  const merchant = await finixClient.getMerchant(church.finixMerchantId);
  const settlementQueueMode: string = merchant.settlement_queue_mode || "UNSET";

  let entries: unknown[] = [];
  if (settlementQueueMode === "MANUAL") {
    const result = await finixClient.listSettlementQueueEntries({ merchantId: church.finixMerchantId });
    // UNCONFIRMED shape: every other list endpoint in this client returns
    // HAL+JSON `_embedded.<resource_name>` (see getSettlementFundingTransfers,
    // listSettlements), so this follows that convention — but it has not
    // been checked against a real settlement_queue_entries response. If
    // this comes back empty against real data, log `result` raw and fix
    // the key here rather than assuming the shape is wrong elsewhere.
    entries = result._embedded?.settlement_queue_entries ?? [];
  }

  return NextResponse.json({
    settlementQueueMode,
    entries,
    autoReleaseWeekdays: church.settlementAutoReleaseWeekdays,
  });
}
