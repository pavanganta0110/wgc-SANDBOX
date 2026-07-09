import { finixClient } from "@/lib/finix/client";
import { prisma } from "@/lib/prisma";
import { redactFinixPayload } from "@/lib/finix/redact";

/**
 * Links every transfer (payment or refund/reversal) accrued into a
 * settlement batch back to that settlement, via GET /settlements/{id}/transfers.
 * Payments and refunds/reversals are both represented as Transfers on
 * Finix's side, but WGC splits them into FinixTransfer and
 * FinixRefundOrReversal, so both tables need the update.
 */
export async function linkTransfersToSettlement(finixSettlementId: string) {
  const response = await finixClient.listSettlementTransfers(finixSettlementId);
  const transfers: any[] = response?._embedded?.transfers ?? [];
  const transferIds = transfers.map((t) => t.id).filter(Boolean);

  if (transferIds.length === 0) return { linked: 0 };

  const [transfersUpdated, refundsUpdated] = await Promise.all([
    prisma.finixTransfer.updateMany({
      where: { finixTransferId: { in: transferIds } },
      data: { finixSettlementId },
    }),
    prisma.finixRefundOrReversal.updateMany({
      where: { finixReversalId: { in: transferIds } },
      data: { finixSettlementId },
    }),
  ]);

  return { linked: transfersUpdated.count + refundsUpdated.count };
}

function toSettlementFields(settlement: any) {
  // Confirmed against a real GET /settlements/{id} response: state field is
  // actually "status", fee total is "total_fee"/"total_fees" (no separate
  // refund/dispute amount at the settlement level), window_start_time is
  // the closest analog to an "accrued at" timestamp.
  return {
    state: settlement.status ?? null,
    totalAmountCents: settlement.total_amount ?? null,
    netAmountCents: settlement.net_amount ?? null,
    feeAmountCents: settlement.total_fee ?? settlement.total_fees ?? null,
    currency: settlement.currency ?? null,
    accruedAt: settlement.window_start_time ? new Date(settlement.window_start_time) : null,
    settledAt: settlement.status === "SETTLED" && settlement.updated_at ? new Date(settlement.updated_at) : null,
  };
}

/**
 * Fetches one settlement directly by ID and links its transfers — reliable
 * even though /settlements list filtering by merchant is broken (see
 * syncSettlements below). Use this when you already know the settlement ID
 * (e.g. from a transfer's own settlement reference).
 */
export async function syncSettlementById(finixSettlementId: string, finixMerchantId: string, churchId?: string) {
  const settlement = await finixClient.getSettlement(finixSettlementId);
  const fields = toSettlementFields(settlement);

  await prisma.finixSettlement.upsert({
    where: { finixSettlementId },
    create: {
      finixSettlementId,
      churchId: churchId ?? null,
      finixMerchantId,
      ...fields,
      rawJsonRedacted: redactFinixPayload(settlement),
      createdAtFinix: settlement.created_at ? new Date(settlement.created_at) : null,
      updatedAtFinix: settlement.updated_at ? new Date(settlement.updated_at) : null,
      lastSyncedAt: new Date(),
    },
    update: {
      churchId: churchId ?? undefined,
      ...fields,
      rawJsonRedacted: redactFinixPayload(settlement),
      updatedAtFinix: settlement.updated_at ? new Date(settlement.updated_at) : null,
      lastSyncedAt: new Date(),
    },
  });

  return linkTransfersToSettlement(finixSettlementId);
}

/**
 * Syncs settlement/payout batches for a merchant into FinixSettlement, then
 * links every transfer/refund accrued into each settlement so payment
 * detail views can show "Settlement: {id}" and accurate transaction-flow
 * events.
 *
 * WARNING: confirmed against the real sandbox API that GET /settlements
 * silently ignores the merchant query param (returns settlements for
 * every merchant on the application, not just this one) — this fans out
 * across every settlement it returns and only writes the ones matching
 * churchId's own data via linkTransfersToSettlement's updateMany, but the
 * FinixSettlement snapshot rows themselves may include other merchants'
 * settlements tagged with the wrong churchId. Prefer syncSettlementById
 * when you know the specific settlement to sync.
 */
export async function syncSettlements(finixMerchantId: string, churchId?: string) {
  const response = await finixClient.listSettlements(finixMerchantId);
  const settlements: any[] = response?._embedded?.settlements ?? [];

  let created = 0;
  let updated = 0;

  for (const settlement of settlements) {
    if (settlement.merchant_id && settlement.merchant_id !== finixMerchantId) continue;

    const existing = await prisma.finixSettlement.findUnique({
      where: { finixSettlementId: settlement.id },
    });

    const fields = toSettlementFields(settlement);

    await prisma.finixSettlement.upsert({
      where: { finixSettlementId: settlement.id },
      create: {
        finixSettlementId: settlement.id,
        churchId: churchId ?? null,
        finixMerchantId,
        ...fields,
        rawJsonRedacted: redactFinixPayload(settlement),
        createdAtFinix: settlement.created_at ? new Date(settlement.created_at) : null,
        updatedAtFinix: settlement.updated_at ? new Date(settlement.updated_at) : null,
        lastSyncedAt: new Date(),
      },
      update: {
        ...fields,
        rawJsonRedacted: redactFinixPayload(settlement),
        updatedAtFinix: settlement.updated_at ? new Date(settlement.updated_at) : null,
        lastSyncedAt: new Date(),
      },
    });

    try {
      await linkTransfersToSettlement(settlement.id);
    } catch (err) {
      console.error(`Failed to link transfers for settlement ${settlement.id}:`, err);
    }

    if (existing) updated++;
    else created++;
  }

  return { processed: settlements.length, created, updated };
}
