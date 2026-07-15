import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runSyncJob } from "@/lib/finix/sync/runSyncJob";

/**
 * Runs merchant + transfers + settlements + disputes + fees + payouts sync
 * for one church, plus payment instruments if the church has a
 * finixIdentityId. Subscriptions are skipped (disabled pending Finix
 * confirmation — see src/app/api/admin/finix-sync/subscriptions/route.ts).
 *
 * Each sub-job is independent and tracked in its own FinixSyncJob row, so a
 * failure in one (e.g. fees) does not block the others.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ churchId: string }> }
) {
  const { churchId } = await params;

  try {
    const church = await prisma.church.findUnique({ where: { id: churchId } });

    if (!church) {
      return NextResponse.json({ error: "Church not found" }, { status: 404 });
    }

    if (!church.finixMerchantId) {
      return NextResponse.json(
        { error: "Church has no finixMerchantId to sync" },
        { status: 400 }
      );
    }

    const jobTypes = [
      "merchant",
      "transfers",
      "settlements",
      "disputes",
      "fees",
      "payouts",
      "authorizations",
    ] as const;
    const results: Record<string, unknown> = {};

    for (const jobType of jobTypes) {
      try {
        results[jobType] = await runSyncJob({
          jobType,
          finixMerchantId: church.finixMerchantId,
          churchId,
        });
      } catch (error: any) {
        results[jobType] = { error: error?.message ?? "Sync failed" };
      }
    }

    if (church.finixIdentityId) {
      try {
        results.paymentInstruments = await runSyncJob({
          jobType: "paymentInstruments",
          finixMerchantId: church.finixMerchantId,
          finixIdentityId: church.finixIdentityId,
          churchId,
        });
      } catch (error: any) {
        results.paymentInstruments = { error: error?.message ?? "Sync failed" };
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    console.error(`Church sync failed for ${churchId}:`, error);
    return NextResponse.json({ error: error?.message ?? "Sync failed" }, { status: 500 });
  }
}
