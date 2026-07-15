import { finixClient } from "@/lib/finix/client";
import { prisma } from "@/lib/prisma";
import { redactFinixPayload } from "@/lib/finix/redact";

/**
 * Syncs fees for a given transfer into FinixFee. Confirmed shape via
 * docs.finix.com/api: GET /fees?transfer={id} returns fee objects with
 * id, fee_type, category, amount, currency, display_name, linked_id,
 * linked_to, merchant.
 *
 * feeType distinguishes processor fees (e.g. VISA_ACQUIRER_PROCESSING_FIXED)
 * from WGC's own application fee — reporting should treat any fee_type
 * containing "APPLICATION" as a WGC platform fee, everything else as a
 * Finix/processor fee, until Finix confirms a cleaner category field for this.
 */
export async function syncFeesForTransfer(finixTransferId: string, churchId?: string) {
  const response = await finixClient.listFeesForTransfer(finixTransferId);
  const fees: any[] = response?._embedded?.fees ?? [];

  let created = 0;
  let updated = 0;

  for (const fee of fees) {
    const existing = await prisma.finixFee.findUnique({ where: { finixFeeId: fee.id } });

    await prisma.finixFee.upsert({
      where: { finixFeeId: fee.id },
      create: {
        finixFeeId: fee.id,
        churchId: churchId ?? null,
        linkedToId: fee.linked_id ?? finixTransferId,
        linkedToType: fee.linked_to ?? "TRANSFER",
        feeType: fee.fee_type ?? fee.category ?? null,
        amountCents: fee.amount ?? null,
        currency: fee.currency ?? null,
        description: fee.display_name ?? fee.label ?? null,
        rawJsonRedacted: redactFinixPayload(fee),
        createdAtFinix: fee.created_at ? new Date(fee.created_at) : null,
        updatedAtFinix: fee.updated_at ? new Date(fee.updated_at) : null,
      },
      update: {
        feeType: fee.fee_type ?? fee.category ?? null,
        amountCents: fee.amount ?? null,
        rawJsonRedacted: redactFinixPayload(fee),
        updatedAtFinix: fee.updated_at ? new Date(fee.updated_at) : null,
      },
    });

    if (existing) updated++;
    else created++;
  }

  return { processed: fees.length, created, updated };
}
