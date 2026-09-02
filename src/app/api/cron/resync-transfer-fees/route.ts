import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { alertCronMisconfiguration } from "@/lib/cron/alertCronMisconfiguration";
import { syncFeesForTransfer } from "@/lib/finix/sync/syncFees";

/**
 * Re-syncs Finix fees for recently-completed transfers a second time, a
 * few days after they first settled — interchange and card-network dues-
 * and-assessments fee lines settle with the networks on Finix's own
 * delayed schedule (confirmed via a real synced fee row whose
 * ready_to_settle_at was ~1 day after its created_at), so the one-time
 * sync triggered by the transfer webhook, right when the transfer
 * completes, can miss them entirely. syncFeesForTransfer is idempotent
 * (upserts on finixFeeId), so re-running it here can never create
 * duplicate fee rows — it only ever fills in rows that weren't available
 * yet at the original sync time.
 *
 * Window is 1-5 days old rather than "everything" — bounded so this stays
 * a fast, cheap daily job instead of re-scanning the entire payment
 * history every run. A payment older than 5 days is assumed to have all
 * its fee lines settled by then; if that assumption turns out wrong for
 * some transactions, widen WINDOW_MAX_DAYS_OLD rather than removing the
 * bound entirely.
 */
const WINDOW_MIN_DAYS_OLD = 1;
const WINDOW_MAX_DAYS_OLD = 5;
// Caps one run's Finix API calls — this is a daily job, not a backfill;
// see scripts/backfill-finix-fee-classification.ts for catching up on a
// larger backlog in one shot.
const MAX_PAYMENTS_PER_RUN = 300;

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (process.env.NODE_ENV === "production") {
    if (!process.env.CRON_SECRET) {
      console.error("CRON_SECRET is not configured in production");
      alertCronMisconfiguration("resync-transfer-fees");
      return NextResponse.json({ error: "Configuration Error" }, { status: 500 });
    }
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const windowStart = new Date(now - WINDOW_MAX_DAYS_OLD * 24 * 60 * 60 * 1000);
  const windowEnd = new Date(now - WINDOW_MIN_DAYS_OLD * 24 * 60 * 60 * 1000);

  const payments = await prisma.payment.findMany({
    where: {
      status: "SUCCEEDED",
      finixTransferId: { not: null },
      createdAt: { gte: windowStart, lte: windowEnd },
    },
    select: { id: true, churchId: true, finixTransferId: true },
    take: MAX_PAYMENTS_PER_RUN,
    orderBy: { createdAt: "asc" },
  });

  let succeeded = 0;
  let failed = 0;

  for (const payment of payments) {
    try {
      await syncFeesForTransfer(payment.finixTransferId as string, payment.churchId);
      succeeded++;
    } catch (err) {
      failed++;
      console.error("resync-transfer-fees: failed for payment", payment.id, err);
    }
  }

  return NextResponse.json({ windowStart, windowEnd, scanned: payments.length, succeeded, failed });
}
