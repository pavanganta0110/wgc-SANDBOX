import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runSyncJob } from "@/lib/finix/sync/runSyncJob";

/**
 * Syncs merchant + transfers + settlements + disputes + fees + payouts (+
 * payment instruments if finixIdentityId is set) for every church with a
 * finixMerchantId. Intended for a nightly cron trigger or manual admin
 * "sync everything" button. Runs sequentially to avoid hammering Finix.
 *
 * Per the one-merchant-test rule: do not call this until a single church's
 * sync via /api/admin/finix-sync/church/:churchId has been verified against
 * the Finix Dashboard for that merchant.
 */
export async function POST() {
  const churches = await prisma.church.findMany({
    where: { finixMerchantId: { not: null } },
  });

  const jobTypes = ["merchant", "transfers", "settlements", "disputes", "fees", "payouts"] as const;
  const summary: { churchId: string; status: "ok" | "error"; error?: string }[] = [];

  for (const church of churches) {
    if (!church.finixMerchantId) continue;

    try {
      for (const jobType of jobTypes) {
        await runSyncJob({
          jobType,
          finixMerchantId: church.finixMerchantId,
          churchId: church.id,
        });
      }
      if (church.finixIdentityId) {
        await runSyncJob({
          jobType: "paymentInstruments",
          finixMerchantId: church.finixMerchantId,
          finixIdentityId: church.finixIdentityId,
          churchId: church.id,
        });
      }
      summary.push({ churchId: church.id, status: "ok" });
    } catch (error: any) {
      console.error(`Full sync failed for church ${church.id}:`, error);
      summary.push({ churchId: church.id, status: "error", error: error?.message });
    }
  }

  return NextResponse.json({ success: true, churchesProcessed: churches.length, summary });
}
