import { finixClient } from "@/lib/finix/client";
import { prisma } from "@/lib/prisma";
import { redactFinixPayload } from "@/lib/finix/redact";

/**
 * Syncs bank payout deposits ("Funding Transfers") for a merchant into
 * FinixFundingTransferAttempt.
 *
 * Confirmed via docs.finix.com/guides/payouts/bank-payouts: Finix has no
 * separate funding-transfer-attempt resource — payouts are regular
 * Transfers with operation_key = "PUSH_TO_ACH", processed on ACH rails.
 * Each approved Settlement contains a Funding Transfer that corresponds to
 * the deposit.
 *
 * TODO: the exact field on the transfer response that links it back to its
 * parent Settlement is not yet confirmed (candidates: `source`, a
 * `_links.settlement` entry, or a `tags` field) — settlementId is left null
 * until that's verified against a real payout in Finix's sandbox. Do not
 * guess; store everything else, which is unaffected by this gap.
 */
export async function syncPayoutsForMerchant(finixMerchantId: string, churchId?: string) {
  const response = await finixClient.listTransfersForMerchant(finixMerchantId);
  const transfers: any[] = response?._embedded?.transfers ?? [];
  const payoutTransfers = transfers.filter((t) => t.operation_key === "PUSH_TO_ACH");

  let created = 0;
  let updated = 0;

  for (const payout of payoutTransfers) {
    const existing = await prisma.finixFundingTransferAttempt.findUnique({
      where: { finixFundingTransferAttemptId: payout.id },
    });

    await prisma.finixFundingTransferAttempt.upsert({
      where: { finixFundingTransferAttemptId: payout.id },
      create: {
        finixFundingTransferAttemptId: payout.id,
        churchId: churchId ?? null,
        finixMerchantId,
        // TODO: settlement linkage unconfirmed, see file-level TODO above.
        finixSettlementId: null,
        state: payout.state ?? null,
        amountCents: payout.amount ?? null,
        currency: payout.currency ?? null,
        failureCode: payout.failure_code ?? null,
        failureMessage: payout.failure_message ?? null,
        rawJsonRedacted: redactFinixPayload(payout),
        createdAtFinix: payout.created_at ? new Date(payout.created_at) : null,
        updatedAtFinix: payout.updated_at ? new Date(payout.updated_at) : null,
        lastSyncedAt: new Date(),
      },
      update: {
        state: payout.state ?? null,
        failureCode: payout.failure_code ?? null,
        failureMessage: payout.failure_message ?? null,
        rawJsonRedacted: redactFinixPayload(payout),
        updatedAtFinix: payout.updated_at ? new Date(payout.updated_at) : null,
        lastSyncedAt: new Date(),
      },
    });

    if (existing) updated++;
    else created++;
  }

  return { processed: payoutTransfers.length, created, updated };
}
