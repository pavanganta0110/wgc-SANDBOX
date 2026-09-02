import { finixClient } from "@/lib/finix/client";
import { prisma } from "@/lib/prisma";
import { redactFinixPayload } from "@/lib/finix/redact";

/**
 * Syncs fees for a given transfer into FinixFee. Confirmed shape via
 * docs.finix.com/api: GET /fees?linked_to={id} returns fee objects with
 * id, fee_type, category, fee_subtype, amount, currency, display_name,
 * linked_id, linked_to, merchant. Finix's docs additionally describe a
 * fee_category field (PLATFORM_FEE / PASSTHROUGH_FEE / PROGRAM_FEE) —
 * distinct from the wire "category" field, which so far has only ever
 * come back as "PROCESSOR" — captured into its own column (feeCategory)
 * in case it starts appearing once real interchange/dues-and-assessments
 * data lands (per Finix's own docs, that data isn't finalized until the
 * 15th of the month after the transaction — see
 * /api/cron/resync-monthly-transfer-fees). Paginates via HAL _links.next, same
 * pattern as syncAuthorizations.ts — a transaction with many fee line
 * items (interchange, processor markup, dues and assessments, etc.,
 * confirmed via Finix's own dashboard to be 5-8+ lines per card
 * transaction) can span more than one page.
 *
 * feeType is a per-card-network string (VISA_ACQUIRER_PROCESSING_FIXED,
 * MASTERCARD_*, etc.) — never used alone to classify a fee as "WGC's own"
 * vs "real processor cost," since that would require enumerating every
 * network's naming. category/feeSubtype are Finix's own network-agnostic
 * classification and are what admin-only profit reporting relies on
 * instead (see src/lib/reports/wgcProfit.ts). This function intentionally
 * does NOT change how Payment.actualFinixFeesCents gets computed
 * (src/app/api/webhooks/finix/route.ts) — that field already flows into
 * merchant-facing Aplos exports (contributionBuilder.ts,
 * settlementReconciliation.ts), so altering its value would change what
 * merchants see in their own accounting software.
 */
export async function syncFeesForTransfer(finixTransferId: string, churchId?: string) {
  let created = 0;
  let updated = 0;
  let processed = 0;

  let nextPageHref: string | null = null;
  let firstPage = true;

  while (firstPage || nextPageHref) {
    const response: any = nextPageHref ? await finixClient.fetchByHref(nextPageHref) : await finixClient.listFeesForTransfer(finixTransferId);
    firstPage = false;
    const fees: any[] = response?._embedded?.fees ?? [];

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
          category: fee.category ?? null,
          feeSubtype: fee.fee_subtype ?? null,
          feeCategory: fee.fee_category ?? null,
          amountCents: fee.amount ?? null,
          currency: fee.currency ?? null,
          description: fee.display_name ?? fee.label ?? null,
          rawJsonRedacted: redactFinixPayload(fee),
          createdAtFinix: fee.created_at ? new Date(fee.created_at) : null,
          updatedAtFinix: fee.updated_at ? new Date(fee.updated_at) : null,
        },
        update: {
          feeType: fee.fee_type ?? fee.category ?? null,
          category: fee.category ?? null,
          feeSubtype: fee.fee_subtype ?? null,
          feeCategory: fee.fee_category ?? null,
          amountCents: fee.amount ?? null,
          rawJsonRedacted: redactFinixPayload(fee),
          updatedAtFinix: fee.updated_at ? new Date(fee.updated_at) : null,
        },
      });

      if (existing) updated++;
      else created++;
      processed++;
    }

    nextPageHref = response?._links?.next?.href ?? null;
  }

  return { processed, created, updated };
}
