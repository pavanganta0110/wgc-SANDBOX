import { NextResponse } from "next/server";
import { runSyncJob } from "@/lib/finix/sync/runSyncJob";

/**
 * Note: finixSettlementId on the synced FinixFundingTransferAttempt rows
 * will be null for now — the exact field linking a payout transfer back to
 * its parent Settlement is unconfirmed. See TODO in
 * src/lib/finix/sync/syncPayouts.ts.
 */
export async function POST(req: Request) {
  try {
    const { finixMerchantId, churchId } = await req.json();

    if (!finixMerchantId) {
      return NextResponse.json({ error: "Missing finixMerchantId" }, { status: 400 });
    }

    const result = await runSyncJob({ jobType: "payouts", finixMerchantId, churchId });
    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    console.error("Payouts sync failed:", error);
    return NextResponse.json({ error: error?.message ?? "Sync failed" }, { status: 500 });
  }
}
