import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncSettlementById } from "@/lib/finix/sync/syncSettlements";
import { syncFinixDataFromWebhookEvent } from "@/app/api/webhooks/finix/route";

/**
 * Periodic reconciliation for two known gaps that webhooks alone can't
 * cover, run on a schedule (see vercel.json) rather than manually patched
 * each time someone notices:
 *
 * 1. Settlements still open (not SETTLED) never get a new webhook just
 *    because another transfer accrued into them — Finix only fires
 *    settlement.* on lifecycle transitions. Re-syncing every open
 *    settlement periodically links any newly-accrued transfers.
 * 2. Webhook syncs that failed all 3 retry attempts (see
 *    src/app/api/webhooks/finix/route.ts) land in FinixRawEventArchive
 *    with processingStatus: FAILED — replay them here instead of leaving
 *    them stuck forever.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (process.env.NODE_ENV === "production") {
    if (!process.env.CRON_SECRET) {
      console.error("CRON_SECRET is not configured in production");
      return NextResponse.json({ error: "Configuration Error" }, { status: 500 });
    }
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const openSettlements = await prisma.finixSettlement.findMany({
    where: {
      state: { not: "SETTLED" },
      churchId: { not: null },
      finixMerchantId: { not: null },
      updatedAtFinix: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
    },
  });

  let settlementsResynced = 0;
  let settlementErrors = 0;
  for (const settlement of openSettlements) {
    try {
      await syncSettlementById(settlement.finixSettlementId, settlement.finixMerchantId!, settlement.churchId ?? undefined);
      settlementsResynced++;
    } catch (err) {
      console.error(`Reconcile: failed to re-sync settlement ${settlement.finixSettlementId}:`, err);
      settlementErrors++;
    }
  }

  const failedEvents = await prisma.finixRawEventArchive.findMany({
    where: { processingStatus: "FAILED" },
    take: 50,
  });

  let eventsRetried = 0;
  let eventsStillFailing = 0;
  for (const event of failedEvents) {
    try {
      await syncFinixDataFromWebhookEvent(
        event.entity ?? "",
        event.eventType ?? "",
        event.payloadRedactedJson,
        event.finixEventId ?? event.id,
        event.createdAt
      );
      await prisma.finixRawEventArchive.update({
        where: { id: event.id },
        data: { processingStatus: "COMPLETED", processedAt: new Date(), errorMessage: null },
      });
      eventsRetried++;
    } catch (err: any) {
      console.error(`Reconcile: retry still failing for event ${event.finixEventId}:`, err);
      await prisma.finixRawEventArchive.update({
        where: { id: event.id },
        data: { errorMessage: err?.message ?? String(err) },
      });
      eventsStillFailing++;
    }
  }

  return NextResponse.json({
    settlementsChecked: openSettlements.length,
    settlementsResynced,
    settlementErrors,
    failedEventsFound: failedEvents.length,
    eventsRetried,
    eventsStillFailing,
  });
}
