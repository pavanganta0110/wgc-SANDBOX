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

/**
 * Recomputes the counts/adjustment totals Finix doesn't report directly on
 * the settlement resource itself (confirmed: no separate refund_amount/
 * dispute_amount/return_amount at the settlement level) from the records
 * WGC has actually linked to it. totalAmountCents/netAmountCents/
 * feeAmountCents stay whatever Finix itself reported — this only fills in
 * the components Finix's settlement payload doesn't carry.
 *
 * otherAdjustmentAmountCents is an honest residual (Finix's reported net
 * minus every component we can independently account for), not a real
 * category with a known source — surfaced as such in the UI rather than
 * labeled as something specific we can't actually confirm.
 */
export async function recomputeSettlementAggregates(finixSettlementId: string) {
  const settlement = await prisma.finixSettlement.findUnique({ where: { finixSettlementId } });
  if (!settlement) return;

  // Every sub-query is scoped by churchId in addition to the ID linkage —
  // finixSettlementId/linkedToId are globally unique Finix IDs so this
  // shouldn't ever exclude a real match, but it's a defense-in-depth
  // guarantee against a record ever being counted into the wrong church's
  // settlement totals.
  const churchId = settlement.churchId;

  const transfers = await prisma.finixTransfer.findMany({ where: { finixSettlementId, churchId } });
  const transferIds = transfers.map((t) => t.finixTransferId);

  const [refunds, fees, bankReturns, disputes] = await Promise.all([
    prisma.finixRefundOrReversal.findMany({ where: { finixSettlementId, churchId } }),
    transferIds.length ? prisma.finixFee.findMany({ where: { linkedToId: { in: transferIds }, churchId } }) : Promise.resolve([]),
    transferIds.length ? prisma.bankReturn.findMany({ where: { originalTransferId: { in: transferIds }, churchId } }) : Promise.resolve([]),
    transferIds.length ? prisma.finixDispute.findMany({ where: { finixTransferId: { in: transferIds }, churchId } }) : Promise.resolve([]),
  ]);

  const refundAmountCents = refunds.reduce((sum, r) => sum + (r.amountCents ?? 0), 0);
  const returnAmountCents = bankReturns.reduce((sum, r) => sum + (r.amountCents ?? 0), 0);
  const disputeAmountCents = disputes.reduce((sum, d) => sum + (d.amountCents ?? 0), 0);

  const knownComponents =
    (settlement.feeAmountCents ?? 0) + refundAmountCents + returnAmountCents + disputeAmountCents;
  const otherAdjustmentAmountCents =
    settlement.netAmountCents != null && settlement.totalAmountCents != null
      ? settlement.netAmountCents - (settlement.totalAmountCents - knownComponents)
      : null;

  await prisma.finixSettlement.update({
    where: { finixSettlementId },
    data: {
      transactionCount: transfers.length,
      feeCount: fees.length,
      refundCount: refunds.length,
      bankReturnCount: bankReturns.length,
      disputeCount: disputes.length,
      refundAmountCents,
      returnAmountCents,
      disputeAmountCents,
      otherAdjustmentAmountCents,
    },
  });
}

// Confirmed against a real GET /settlements/{id} response: state field is
// actually "status", fee total is "total_fee"/"total_fees" (no separate
// refund/dispute amount at the settlement level), window_start_time is
// the closest analog to an "accrued at" timestamp.
export function toSettlementFieldsForCreate(settlement: any) {
  return {
    state: settlement.status ?? null,
    processorState: settlement.status ?? null,
    totalAmountCents: settlement.total_amount ?? null,
    netAmountCents: settlement.net_amount ?? null,
    feeAmountCents: settlement.total_fee ?? settlement.total_fees ?? null,
    traceId: settlement.trace_id ?? null,
    currency: settlement.currency ?? null,
    accruedAt: settlement.window_start_time ? new Date(settlement.window_start_time) : null,
    settledAt: settlement.status === "SETTLED" && settlement.updated_at ? new Date(settlement.updated_at) : null,
  };
}

// Same fields as create, but every optional value falls back to `undefined`
// (Prisma skips the field entirely) instead of `null` — a later webhook
// firing with a partial payload must never blank out a value a previous,
// more complete sync already populated.
export function toSettlementFieldsForUpdate(settlement: any) {
  return {
    state: settlement.status ?? undefined,
    processorState: settlement.status ?? undefined,
    totalAmountCents: settlement.total_amount ?? undefined,
    netAmountCents: settlement.net_amount ?? undefined,
    feeAmountCents: settlement.total_fee ?? settlement.total_fees ?? undefined,
    traceId: settlement.trace_id ?? undefined,
    currency: settlement.currency ?? undefined,
    accruedAt: settlement.window_start_time ? new Date(settlement.window_start_time) : undefined,
    settledAt: settlement.status === "SETTLED" && settlement.updated_at ? new Date(settlement.updated_at) : undefined,
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

  await prisma.finixSettlement.upsert({
    where: { finixSettlementId },
    create: {
      finixSettlementId,
      churchId: churchId ?? null,
      finixMerchantId,
      ...toSettlementFieldsForCreate(settlement),
      rawJsonRedacted: redactFinixPayload(settlement),
      createdAtFinix: settlement.created_at ? new Date(settlement.created_at) : null,
      updatedAtFinix: settlement.updated_at ? new Date(settlement.updated_at) : null,
      lastSyncedAt: new Date(),
    },
    update: {
      churchId: churchId ?? undefined,
      ...toSettlementFieldsForUpdate(settlement),
      rawJsonRedacted: redactFinixPayload(settlement),
      updatedAtFinix: settlement.updated_at ? new Date(settlement.updated_at) : undefined,
      lastSyncedAt: new Date(),
    },
  });

  const result = await linkTransfersToSettlement(finixSettlementId);
  await recomputeSettlementAggregates(finixSettlementId);
  return result;
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

    await prisma.finixSettlement.upsert({
      where: { finixSettlementId: settlement.id },
      create: {
        finixSettlementId: settlement.id,
        churchId: churchId ?? null,
        finixMerchantId,
        ...toSettlementFieldsForCreate(settlement),
        rawJsonRedacted: redactFinixPayload(settlement),
        createdAtFinix: settlement.created_at ? new Date(settlement.created_at) : null,
        updatedAtFinix: settlement.updated_at ? new Date(settlement.updated_at) : null,
        lastSyncedAt: new Date(),
      },
      update: {
        ...toSettlementFieldsForUpdate(settlement),
        rawJsonRedacted: redactFinixPayload(settlement),
        updatedAtFinix: settlement.updated_at ? new Date(settlement.updated_at) : undefined,
        lastSyncedAt: new Date(),
      },
    });

    try {
      await linkTransfersToSettlement(settlement.id);
      await recomputeSettlementAggregates(settlement.id);
    } catch (err) {
      console.error(`Failed to link transfers for settlement ${settlement.id}:`, err);
    }

    if (existing) updated++;
    else created++;
  }

  return { processed: settlements.length, created, updated };
}
