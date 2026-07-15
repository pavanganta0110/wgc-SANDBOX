import { prisma } from "@/lib/prisma";
import { syncMerchant } from "@/lib/finix/sync/syncMerchant";
import { syncTransfers } from "@/lib/finix/sync/syncTransfers";
import { syncSettlements } from "@/lib/finix/sync/syncSettlements";
import { syncDisputes } from "@/lib/finix/sync/syncDisputes";
import { syncFeesForTransfer } from "@/lib/finix/sync/syncFees";
import { syncPayoutsForMerchant } from "@/lib/finix/sync/syncPayouts";
import { syncPaymentInstrumentsForIdentity } from "@/lib/finix/sync/syncPaymentInstruments";
import { syncAuthorizations } from "@/lib/finix/sync/syncAuthorizations";
import { finixClient } from "@/lib/finix/client";

export type SyncJobType =
  | "merchant"
  | "transfers"
  | "settlements"
  | "disputes"
  | "fees"
  | "payouts"
  | "paymentInstruments"
  | "authorizations";

/**
 * Runs one sync job for one merchant, tracked in FinixSyncJob. All job types
 * below are backed by confirmed Finix API endpoints. "subscriptions" is
 * intentionally excluded — Finix subscription enablement is unconfirmed for
 * this account, so it stays a code-only stub (see syncSubscriptions.ts) until
 * Finix confirms the feature is enabled.
 *
 * finixIdentityId is required for "paymentInstruments" (identity-scoped, not
 * merchant-scoped) — pass it via params.finixIdentityId.
 */
export async function runSyncJob(params: {
  jobType: SyncJobType;
  finixMerchantId: string;
  finixIdentityId?: string;
  churchId?: string;
}) {
  const job = await prisma.finixSyncJob.create({
    data: {
      jobType: params.jobType,
      finixMerchantId: params.finixMerchantId,
      churchId: params.churchId ?? null,
      status: "RUNNING",
      startedAt: new Date(),
    },
  });

  try {
    let result: { processed: number; created: number; updated: number } = {
      processed: 0,
      created: 0,
      updated: 0,
    };

    switch (params.jobType) {
      case "merchant":
        await syncMerchant(params.finixMerchantId, params.churchId);
        result = { processed: 1, created: 0, updated: 1 };
        break;
      case "transfers":
        result = await syncTransfers(params.finixMerchantId, params.churchId);
        break;
      case "settlements":
        result = await syncSettlements(params.finixMerchantId, params.churchId);
        break;
      case "disputes":
        result = await syncDisputes(params.finixMerchantId, params.churchId);
        break;
      case "payouts":
        result = await syncPayoutsForMerchant(params.finixMerchantId, params.churchId);
        break;
      case "fees": {
        // Fees are per-transfer, so fan out across every transfer for this merchant.
        const transfersResponse = await finixClient.listTransfersForMerchant(
          params.finixMerchantId
        );
        const transfers: any[] = transfersResponse?._embedded?.transfers ?? [];
        let processed = 0;
        let created = 0;
        let updated = 0;
        for (const transfer of transfers) {
          const feeResult = await syncFeesForTransfer(transfer.id, params.churchId);
          processed += feeResult.processed;
          created += feeResult.created;
          updated += feeResult.updated;
        }
        result = { processed, created, updated };
        break;
      }
      case "paymentInstruments":
        if (!params.finixIdentityId) {
          throw new Error("paymentInstruments sync requires finixIdentityId");
        }
        result = await syncPaymentInstrumentsForIdentity(params.finixIdentityId, {
          churchId: params.churchId,
        });
        break;
      case "authorizations":
        result = await syncAuthorizations(params.finixMerchantId, params.churchId);
        break;
    }

    await prisma.finixSyncJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        recordsProcessed: result.processed,
        recordsCreated: result.created,
        recordsUpdated: result.updated,
      },
    });

    return result;
  } catch (error: any) {
    await prisma.finixSyncJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        failedAt: new Date(),
        errorMessage: error?.message ?? "Unknown sync error",
      },
    });
    throw error;
  }
}
