import { finixClient } from "@/lib/finix/client";
import { prisma } from "@/lib/prisma";
import { redactFinixPayload } from "@/lib/finix/redact";
import { mapFinixDisputeStateToWgcStatus } from "@/lib/finix/statusMapping";

/**
 * Syncs disputes/chargebacks for a merchant into FinixDispute.
 * TODO: confirm evidence.created/evidence.updated payload shape and whether
 * "outcome" is a separate field or only derivable from final state.
 */
export async function syncDisputes(finixMerchantId: string, churchId?: string) {
  const response = await finixClient.listDisputes(finixMerchantId);
  const disputes: any[] = response?._embedded?.disputes ?? [];

  let created = 0;
  let updated = 0;

  for (const dispute of disputes) {
    const existing = await prisma.finixDispute.findUnique({
      where: { finixDisputeId: dispute.id },
    });

    await prisma.finixDispute.upsert({
      where: { finixDisputeId: dispute.id },
      create: {
        finixDisputeId: dispute.id,
        churchId: churchId ?? null,
        finixMerchantId,
        finixTransferId: dispute.transfer ?? null,
        state: mapFinixDisputeStateToWgcStatus(dispute.state),
        processorState: dispute.state ?? null,
        reason: dispute.reason ?? null,
        amountCents: dispute.amount ?? null,
        currency: dispute.currency ?? null,
        rawJsonRedacted: redactFinixPayload(dispute),
        createdAtFinix: dispute.created_at ? new Date(dispute.created_at) : null,
        updatedAtFinix: dispute.updated_at ? new Date(dispute.updated_at) : null,
        lastSyncedAt: new Date(),
      },
      update: {
        state: mapFinixDisputeStateToWgcStatus(dispute.state),
        processorState: dispute.state ?? null,
        rawJsonRedacted: redactFinixPayload(dispute),
        updatedAtFinix: dispute.updated_at ? new Date(dispute.updated_at) : null,
        lastSyncedAt: new Date(),
      },
    });

    if (existing) updated++;
    else created++;
  }

  return { processed: disputes.length, created, updated };
}
