import { NextResponse } from "next/server";
import { backfillSettlementDeposits } from "@/lib/finix/sync/backfillSettlementDeposits";

/**
 * Protected admin backfill for settlements stuck showing UNKNOWN status or
 * no linked merchant deposit. Gated two ways: (1) this whole /api/admin/*
 * path is behind middleware.ts's HTTP Basic Auth, same as every other
 * admin route in this codebase; (2) it additionally requires
 * ALLOW_SETTLEMENT_BACKFILL=true to actually run, so it can never fire in
 * production by accident (e.g. a stray request) without someone having
 * explicitly turned it on for that environment first.
 */
export async function POST(req: Request) {
  if (process.env.ALLOW_SETTLEMENT_BACKFILL !== "true") {
    return NextResponse.json(
      { error: "Settlement backfill is disabled. Set ALLOW_SETTLEMENT_BACKFILL=true to enable it in this environment." },
      { status: 403 },
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const pageSize = typeof body.pageSize === "number" ? body.pageSize : undefined;
    const concurrency = typeof body.concurrency === "number" ? body.concurrency : undefined;

    const summary = await backfillSettlementDeposits({ pageSize, concurrency });
    return NextResponse.json({ success: true, summary });
  } catch (error: any) {
    console.error("Settlement deposit backfill failed:", error);
    return NextResponse.json({ error: error?.message ?? "Backfill failed" }, { status: 500 });
  }
}
