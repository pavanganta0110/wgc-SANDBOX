import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAplosSyncGloballyEnabled } from "@/lib/integrations/aplos/config";
import { processSettlement, type SyncSettlementOutcome } from "@/lib/integrations/aplos/syncEngine";
import { getReadyConnectionToken } from "@/lib/integrations/aplos/resourceService";

/**
 * Own schedule, separate from the existing /api/cron/reconcile (per
 * docs/integrations/aplos.md section 1 — this is a distinct concern from
 * Finix settlement/webhook reconciliation). Not yet added to vercel.json's
 * crons array — that's an infrastructure change deliberately deferred until
 * a pilot organization is ready to enable automatic sync, so this never
 * starts running against real (even sandbox) data before that's intended.
 *
 * For each Church with AplosConnection.automaticSyncEnabled = true and
 * status CONNECTED, finds every SETTLED FinixSettlement that settled on or
 * after this connection was made — never a settlement that predates the
 * connection, so enabling automatic sync can never silently back-post a
 * church's entire prior settlement history into their Aplos ledger as
 * duplicate contributions they may have already entered by hand. A church
 * that genuinely wants historical settlements synced can request that
 * explicitly (a future, deliberate action, not an automatic side effect of
 * enabling sync) — and does not already have a SYNCED/NEEDS_REVIEW/
 * CANCELLED AplosSyncRecord at the connection's current syncVersion. Each
 * candidate is handed to AplosSettlementSyncService.processSettlement,
 * which itself performs the real eligibility, locking, and retry-due
 * checks per settlement.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (process.env.NODE_ENV === "production") {
    if (!process.env.CRON_SECRET) {
      console.error("CRON_SECRET is not configured in production");
      return NextResponse.json({ error: "Configuration Error" }, { status: 500 });
    }
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAplosSyncGloballyEnabled()) {
    return NextResponse.json({ skipped: true, reason: "APLOS_SYNC_ENABLED is not set to true" });
  }

  const connections = await prisma.aplosConnection.findMany({
    where: { automaticSyncEnabled: true, status: "CONNECTED" },
    select: { churchId: true, syncVersion: true, connectedAt: true },
  });

  const outcomeCounts: Partial<Record<SyncSettlementOutcome, number>> = {};
  let settlementsChecked = 0;
  let errors = 0;

  for (const connection of connections) {
    const settledSettlements = await prisma.finixSettlement.findMany({
      where: {
        churchId: connection.churchId,
        state: "SETTLED",
        ...(connection.connectedAt ? { settledAt: { gte: connection.connectedAt } } : {}),
      },
      select: { finixSettlementId: true },
    });
    if (settledSettlements.length === 0) continue;

    const existingRecords = await prisma.aplosSyncRecord.findMany({
      where: {
        churchId: connection.churchId,
        syncVersion: connection.syncVersion,
        settlementId: { in: settledSettlements.map((s) => s.finixSettlementId) },
        status: { in: ["SYNCED", "NEEDS_REVIEW", "CANCELLED"] },
      },
      select: { settlementId: true },
    });
    const finished = new Set(existingRecords.map((r) => r.settlementId));
    const candidates = settledSettlements.filter((s) => !finished.has(s.finixSettlementId));
    if (candidates.length === 0) continue;

    // Fetched once per church per cron tick, not once per settlement — see
    // processSettlement()'s `preAuth` parameter for why. If this fails,
    // `preAuth` stays undefined and each settlement below falls back to
    // its own per-call token fetch (and reports BLOCKED accurately if the
    // connection truly isn't ready), so no candidate is silently skipped.
    let preAuth: { token: string; aplosAccountId: string } | undefined;
    try {
      preAuth = await getReadyConnectionToken(connection.churchId);
    } catch {
      preAuth = undefined;
    }

    for (const settlement of candidates) {
      settlementsChecked++;
      try {
        const result = await processSettlement(connection.churchId, settlement.finixSettlementId, preAuth);
        outcomeCounts[result.outcome] = (outcomeCounts[result.outcome] ?? 0) + 1;
      } catch (err) {
        errors++;
        console.error(`Aplos sync: failed to process settlement ${settlement.finixSettlementId} for church ${connection.churchId}:`, err);
      }
    }
  }

  return NextResponse.json({
    churchesChecked: connections.length,
    settlementsChecked,
    outcomeCounts,
    errors,
  });
}
