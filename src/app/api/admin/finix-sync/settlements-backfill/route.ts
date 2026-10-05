import { NextResponse } from "next/server";
import { backfillSettlementDeposits } from "@/lib/finix/sync/backfillSettlementDeposits";
import { getAdminSession } from "@/lib/auth/session";

/**
 * Protected admin backfill for settlements stuck showing UNKNOWN status or
 * no linked merchant deposit. Gated two ways: (1) requires a real,
 * DB-backed admin session via getAdminSession() (middleware.ts's own
 * cookie check alone is signature/expiry-only — it does not revoke a
 * disabled admin's or a just-password-reset admin's existing session, so
 * every route in this admin surface must call getAdminSession() itself);
 * (2) additionally requires ALLOW_SETTLEMENT_BACKFILL=true to actually run,
 * so it can never fire in production by accident (e.g. a stray request)
 * without someone having explicitly turned it on for that environment first.
 */
export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
