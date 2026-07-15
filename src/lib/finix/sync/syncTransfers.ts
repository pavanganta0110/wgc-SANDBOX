import { finixClient } from "@/lib/finix/client";
import { prisma } from "@/lib/prisma";
import { redactFinixPayload } from "@/lib/finix/redact";

/**
 * Backfills/syncs Finix Transfers (donations, ACH, card, etc.) for a merchant
 * into FinixTransfer. Tags on the transfer (wgcPaymentId, churchId, donorId,
 * fundId, source) are used to map back to WGC's own Payment record when
 * present; otherwise the record is stored with source = "finix_dashboard".
 * TODO: confirm pagination/cursor shape from Finix's list response (_links.next).
 */
export async function syncTransfers(finixMerchantId: string, churchId?: string) {
  const response = await finixClient.listTransfersForMerchant(finixMerchantId);
  const transfers: any[] = response?._embedded?.transfers ?? [];

  let created = 0;
  let updated = 0;

  for (const transfer of transfers) {
    const tags = transfer.tags ?? {};
    const source = tags.source === "wgc_giving_page" ? "wgc_giving_page" : "finix_dashboard";

    const existing = await prisma.finixTransfer.findUnique({
      where: { finixTransferId: transfer.id },
    });

    await prisma.finixTransfer.upsert({
      where: { finixTransferId: transfer.id },
      create: {
        finixTransferId: transfer.id,
        churchId: churchId ?? null,
        finixMerchantId,
        finixBuyerIdentityId: transfer.merchant_identity ?? null,
        finixPaymentInstrumentId: transfer.source ?? null,
        type: transfer.type ?? null,
        subtype: transfer.subtype ?? null,
        state: transfer.state ?? null,
        amountCents: transfer.amount ?? null,
        currency: transfer.currency ?? null,
        feeCents: transfer.fee ?? null,
        failureCode: transfer.failure_code ?? null,
        failureMessage: transfer.failure_message ?? null,
        traceId: transfer.trace_id ?? null,
        statementDescriptor: transfer.statement_descriptor ?? null,
        source,
        tagsJson: tags,
        rawJsonRedacted: redactFinixPayload(transfer),
        createdAtFinix: transfer.created_at ? new Date(transfer.created_at) : null,
        updatedAtFinix: transfer.updated_at ? new Date(transfer.updated_at) : null,
        lastSyncedAt: new Date(),
      },
      update: {
        state: transfer.state ?? null,
        failureCode: transfer.failure_code ?? null,
        failureMessage: transfer.failure_message ?? null,
        rawJsonRedacted: redactFinixPayload(transfer),
        updatedAtFinix: transfer.updated_at ? new Date(transfer.updated_at) : null,
        lastSyncedAt: new Date(),
      },
    });

    if (existing) updated++;
    else created++;
  }

  return { processed: transfers.length, created, updated };
}
