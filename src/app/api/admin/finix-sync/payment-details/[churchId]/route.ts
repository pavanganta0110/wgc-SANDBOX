import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncPaymentInstrument } from "@/lib/finix/sync/syncPaymentInstruments";
import { syncFeesForTransfer } from "@/lib/finix/sync/syncFees";
import { syncSettlements } from "@/lib/finix/sync/syncSettlements";

/**
 * Backfills payment instrument + donor identity + fee + settlement linkage
 * data for every FinixTransfer already stored for a church. Needed because
 * the webhook sync layer only started fetching this data going forward —
 * transfers synced before that change have no linked donor, fee, or
 * settlement rows yet.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ churchId: string }> }
) {
  const { churchId } = await params;

  const church = await prisma.church.findUnique({ where: { id: churchId } });
  if (!church) {
    return NextResponse.json({ error: "Church not found" }, { status: 404 });
  }

  let settlementsResult: { processed: number; created: number; updated: number } | { error: string } = {
    processed: 0,
    created: 0,
    updated: 0,
  };
  if (church.finixMerchantId) {
    try {
      settlementsResult = await syncSettlements(church.finixMerchantId, churchId);
    } catch (err: any) {
      settlementsResult = { error: err?.message ?? "Settlement sync failed" };
    }
  }

  const transfers = await prisma.finixTransfer.findMany({
    where: { churchId },
    select: { finixTransferId: true, finixPaymentInstrumentId: true },
  });

  let instrumentsSynced = 0;
  let instrumentErrors = 0;
  let feesProcessed = 0;
  let feeErrors = 0;

  const seenInstruments = new Set<string>();

  for (const t of transfers) {
    if (t.finixPaymentInstrumentId && !seenInstruments.has(t.finixPaymentInstrumentId)) {
      seenInstruments.add(t.finixPaymentInstrumentId);
      try {
        await syncPaymentInstrument(t.finixPaymentInstrumentId, { churchId });
        instrumentsSynced++;
      } catch (err: any) {
        console.error(`Instrument sync failed for ${t.finixPaymentInstrumentId}:`, err?.message);
        instrumentErrors++;
      }
    }

    try {
      const result = await syncFeesForTransfer(t.finixTransferId, churchId);
      feesProcessed += result.processed;
    } catch (err: any) {
      console.error(`Fee sync failed for ${t.finixTransferId}:`, err?.message);
      feeErrors++;
    }
  }

  return NextResponse.json({
    success: true,
    settlementsResult,
    transfersScanned: transfers.length,
    instrumentsSynced,
    instrumentErrors,
    feesProcessed,
    feeErrors,
  });
}
