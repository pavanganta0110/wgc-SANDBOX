import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { alertCronMisconfiguration } from "@/lib/cron/alertCronMisconfiguration";
import { syncFeesForTransfer } from "@/lib/finix/sync/syncFees";

/**
 * Re-syncs Finix fees for every transfer from the PREVIOUS calendar month,
 * once a month — separate from /api/cron/resync-transfer-fees (which only
 * looks 1-5 days back). Finix's own docs (Consolidated Fees Reports) say
 * network/passthrough fee data (interchange, card-network dues and
 * assessments — see fee_category "PASSTHROUGH_FEE" in FinixFee) "can be
 * incomplete or blank until Finix receives and processes all data up to
 * the 15th day of the following month." Scheduled on the 16th so the
 * prior month's data has had a full day to finish landing on Finix's side
 * (vercel.json).
 *
 * Idempotent (syncFeesForTransfer upserts on finixFeeId) — safe to re-run,
 * and safe if this misses the exact day a given transfer's data actually
 * lands, since the daily resync-transfer-fees job (or a future manual
 * trigger) can always catch it later without creating duplicates.
 */
const MAX_PAYMENTS_PER_RUN = 2000;

function previousCalendarMonthRange(now: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
  return { start, end };
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (process.env.NODE_ENV === "production") {
    if (!process.env.CRON_SECRET) {
      console.error("CRON_SECRET is not configured in production");
      alertCronMisconfiguration("resync-monthly-transfer-fees");
      return NextResponse.json({ error: "Configuration Error" }, { status: 500 });
    }
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { start, end } = previousCalendarMonthRange(new Date());

  const payments = await prisma.payment.findMany({
    where: {
      status: "SUCCEEDED",
      finixTransferId: { not: null },
      createdAt: { gte: start, lt: end },
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
      console.error("resync-monthly-transfer-fees: failed for payment", payment.id, err);
    }
  }

  return NextResponse.json({ monthStart: start, monthEnd: end, scanned: payments.length, succeeded, failed });
}
