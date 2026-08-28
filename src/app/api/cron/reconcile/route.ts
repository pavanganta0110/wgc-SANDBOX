import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncSettlementById, syncSettlements } from "@/lib/finix/sync/syncSettlements";
import { alertCronMisconfiguration } from "@/lib/cron/alertCronMisconfiguration";
import { syncFinixDataFromWebhookEvent } from "@/app/api/webhooks/finix/route";
import { finixClient } from "@/lib/finix/client";
import { sendWgcAdminEmail } from "@/lib/email";

/**
 * Periodic reconciliation for three known gaps that webhooks alone can't
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
 * 3. A settlement WGC has never heard of at all (confirmed against live
 *    data: Finix doesn't fire a settlement.* webhook the moment a batch
 *    opens and starts ACCRUING — only once it reaches AWAITING_APPROVAL
 *    or later). Without this, an accruing settlement is invisible in WGC
 *    until Finix decides to tell us about it. syncSettlements() (list +
 *    upsert, already used by the manual admin "sync everything" button)
 *    run per active merchant here is what actually discovers those.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (process.env.NODE_ENV === "production") {
    if (!process.env.CRON_SECRET) {
      console.error("CRON_SECRET is not configured in production");
      alertCronMisconfiguration("reconcile");
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

  // Discover settlements WGC has no row for yet at all (see point 3 above)
  // — separate from the openSettlements resync loop above, which only
  // re-checks settlements we already know about. Same
  // finixMerchantId-not-null filter as the manual "sync everything"
  // button (src/app/api/admin/finix-sync/all/route.ts), run sequentially
  // to avoid hammering Finix.
  const activeMerchants = await prisma.church.findMany({
    where: { finixMerchantId: { not: null } },
    select: { id: true, finixMerchantId: true },
  });

  let settlementsDiscovered = 0;
  let settlementsUpdated = 0;
  let merchantDiscoveryErrors = 0;
  for (const merchant of activeMerchants) {
    if (!merchant.finixMerchantId) continue;
    try {
      const result = await syncSettlements(merchant.finixMerchantId, merchant.id);
      settlementsDiscovered += result.created;
      settlementsUpdated += result.updated;
    } catch (err) {
      console.error(`Reconcile: settlement discovery failed for church ${merchant.id}:`, err);
      merchantDiscoveryErrors++;
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

  // 3. Stuck PaymentAttempt sweep — a payment route calls Finix (the real
  // charge) before writing the local Payment/FinixTransfer record. If that
  // local write fails after Finix already succeeded, nothing else in the
  // codebase ever discovers it (the existing transfer reconciliation only
  // re-checks transfers that already HAVE a local row). This sweep is the
  // backstop: it never auto-creates financial records (too easy to get fee
  // splits/attribution/receipts wrong from a cron) — it only detects the
  // gap and alerts a human via email, and separately closes out attempts
  // that were genuinely abandoned (donor never completed checkout).
  const STUCK_ALERT_MARKER = "ORPHANED_CHARGE_ALERTED";
  const stuckAttempts = await prisma.paymentAttempt.findMany({
    where: {
      status: "PROCESSING",
      updatedAt: { lte: new Date(Date.now() - 15 * 60 * 1000) },
      NOT: { failureMessage: { startsWith: STUCK_ALERT_MARKER } },
    },
    take: 100,
  });

  let orphanedChargesFound = 0;
  let abandonedAttemptsClosed = 0;
  let stuckSweepErrors = 0;
  for (const attempt of stuckAttempts) {
    try {
      const transfer = await finixClient.findTransferByIdempotencyId(attempt.idempotencyId);
      if (transfer) {
        const existingPayment = await prisma.payment.findFirst({ where: { finixTransferId: transfer.id } });
        if (!existingPayment) {
          orphanedChargesFound++;
          const church = await prisma.church.findUnique({ where: { id: attempt.churchId } });
          await sendWgcAdminEmail({
            merchantName: church?.name || attempt.churchId,
            contactEmail: church?.primaryContactEmail || "unknown",
            finixMerchantId: church?.finixMerchantId || undefined,
            newStatus: "ORPHANED_CHARGE",
            whatHappened: `A Finix transfer (${transfer.id}, state ${transfer.state}, amount ${attempt.totalCents} cents) succeeded but no matching WGC Payment record exists. PaymentAttempt ${attempt.id} (clientAttemptId ${attempt.clientAttemptId}) is stuck in PROCESSING.`,
            actionNeeded: "Manually verify the Finix transfer and create the corresponding Payment/receipt record, or refund the transfer if it should not have succeeded.",
            adminDashboardLink: `${process.env.NEXT_PUBLIC_APP_URL || "https://www.wgcpayments.com"}/admin/merchants`,
            customSubject: `[Action Needed] Orphaned Finix charge for ${church?.name || attempt.churchId}`,
          });
          await prisma.paymentAttempt.update({
            where: { id: attempt.id },
            data: { failureMessage: `${STUCK_ALERT_MARKER}: transfer ${transfer.id} has no local Payment record` },
          });
        }
      } else if (attempt.updatedAt.getTime() < Date.now() - 60 * 60 * 1000) {
        // No Finix transfer ever showed up for this attempt after an hour —
        // the donor abandoned checkout before a charge was made. Close it
        // out so it stops appearing "stuck" (never touches Finix or money).
        await prisma.paymentAttempt.update({
          where: { id: attempt.id },
          data: { status: "FAILED", failureMessage: "Abandoned — no matching Finix transfer found after 1 hour" },
        });
        abandonedAttemptsClosed++;
      }
    } catch (err) {
      console.error(`Reconcile: stuck-attempt sweep failed for PaymentAttempt ${attempt.id}:`, err);
      stuckSweepErrors++;
    }
  }

  return NextResponse.json({
    settlementsChecked: openSettlements.length,
    settlementsResynced,
    settlementErrors,
    merchantsCheckedForNewSettlements: activeMerchants.length,
    settlementsDiscovered,
    settlementsUpdated,
    merchantDiscoveryErrors,
    failedEventsFound: failedEvents.length,
    eventsRetried,
    eventsStillFailing,
    stuckAttemptsChecked: stuckAttempts.length,
    orphanedChargesFound,
    abandonedAttemptsClosed,
    stuckSweepErrors,
  });
}
