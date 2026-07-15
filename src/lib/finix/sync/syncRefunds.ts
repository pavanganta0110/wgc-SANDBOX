import { finixClient } from "@/lib/finix/client";
import { prisma } from "@/lib/prisma";
import { redactFinixPayload } from "@/lib/finix/redact";

/**
 * Syncs reversals/refunds for a given original transfer into
 * FinixRefundOrReversal. Handles both WGC-initiated refunds and refunds
 * created directly in the Finix Dashboard (source = "finix_dashboard").
 */
export async function syncRefundsForTransfer(originalTransferId: string, churchId?: string) {
  const response = await finixClient.listTransferReversals(originalTransferId);
  const reversals: any[] = response?._embedded?.reversals ?? [];

  let created = 0;
  let updated = 0;

  for (const reversal of reversals) {
    const tags = reversal.tags ?? {};
    const source = tags.source === "wgc_admin" ? "wgc_admin" : "finix_dashboard";

    const existing = await prisma.finixRefundOrReversal.findUnique({
      where: { finixReversalId: reversal.id },
    });

    await prisma.finixRefundOrReversal.upsert({
      where: { finixReversalId: reversal.id },
      create: {
        finixReversalId: reversal.id,
        finixOriginalTransferId: originalTransferId,
        churchId: churchId ?? null,
        finixMerchantId: reversal.merchant ?? null,
        amountCents: reversal.amount ?? null,
        currency: reversal.currency ?? null,
        state: reversal.state ?? null,
        failureCode: reversal.failure_code ?? null,
        failureMessage: reversal.failure_message ?? null,
        type: reversal.type ?? null,
        subtype: reversal.subtype ?? null,
        source,
        traceId: reversal.trace_id ?? null,
        tagsJson: reversal.tags ?? null,
        rawJsonRedacted: redactFinixPayload(reversal),
        createdAtFinix: reversal.created_at ? new Date(reversal.created_at) : null,
        updatedAtFinix: reversal.updated_at ? new Date(reversal.updated_at) : null,
        lastSyncedAt: new Date(),
      },
      update: {
        state: reversal.state ?? null,
        failureCode: reversal.failure_code ?? null,
        failureMessage: reversal.failure_message ?? null,
        traceId: reversal.trace_id ?? null,
        tagsJson: reversal.tags ?? null,
        rawJsonRedacted: redactFinixPayload(reversal),
        updatedAtFinix: reversal.updated_at ? new Date(reversal.updated_at) : null,
        lastSyncedAt: new Date(),
      },
    });

    if (existing) updated++;
    else created++;
  }

  return { processed: reversals.length, created, updated };
}
