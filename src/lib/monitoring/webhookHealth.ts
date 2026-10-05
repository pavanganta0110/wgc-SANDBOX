import { prisma } from "@/lib/prisma";
import { recordHealthEvent } from "./healthEvents";

/**
 * Records a WGC health event for a webhook processing failure that has
 * actually exhausted its retries / reached a terminal error state — called
 * from src/app/api/webhooks/finix/route.ts at its two genuine failure
 * points (the additive sync layer after all 3 inline retry attempts are
 * exhausted, and the onboarding-status-update path's terminal catch).
 * Never called for an individual attempt within that inline retry loop —
 * a single transient attempt failure that the loop itself recovers from is
 * not "an actual operational problem" per the design doc, it's the retry
 * mechanism working as intended.
 *
 * Reuses FinixWebhookEvent/FinixRawEventArchive as the source of truth for
 * webhook processing history and backlog (see serviceStatus.ts's
 * webhooksStatus()) — this only adds System Health visibility on top.
 */
export async function recordWebhookProcessingFailure(params: {
  provider: string;
  eventType: string;
  finixEventId: string;
  finixMerchantId?: string | null;
  errorMessage: string;
}): Promise<void> {
  try {
    // Best-effort resolution of our own church id from Finix's merchant id
    // — a real Finix merchant id doesn't necessarily map to a church we
    // know about (e.g. a test/sandbox event), so a miss here is expected
    // and not itself an error.
    const church = params.finixMerchantId ? await prisma.church.findFirst({ where: { finixMerchantId: params.finixMerchantId }, select: { id: true } }) : null;

    await recordHealthEvent({
      service: "Webhooks",
      integration: params.provider,
      operation: params.eventType,
      status: "FAILED",
      severity: "ERROR",
      merchantId: church?.id,
      externalId: params.finixEventId,
      message: params.errorMessage,
      metadata: { finixMerchantId: params.finixMerchantId },
    });
  } catch (err) {
    console.error("[recordWebhookProcessingFailure] failed to record health event:", err);
  }
}
