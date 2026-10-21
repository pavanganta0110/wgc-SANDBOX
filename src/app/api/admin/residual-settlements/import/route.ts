import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logBillingAuditEvent } from "@/lib/billing/billingAudit";
import { parseResidualSettlementsExport } from "@/lib/admin/residualSettlementImport";
import { requireResidualManager } from "../auth";

const MAX_TEXT_LENGTH = 500_000;

/**
 * Imports Finix's "Residual Settlements" dashboard export (CSV or pasted
 * table). Upserts by billing settlement ID, so re-importing the same export
 * is safe: amounts and state are refreshed, and an admin's "deposit
 * received" confirmation is never overwritten. Bookkeeping only.
 */
export async function POST(req: Request) {
  const auth = await requireResidualManager();
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const body = await req.json().catch(() => ({}));
  const text = typeof body?.text === "string" ? body.text : "";
  if (!text.trim()) return NextResponse.json({ error: "Paste or upload the Residual Settlements export." }, { status: 400 });
  if (text.length > MAX_TEXT_LENGTH) return NextResponse.json({ error: "That file is too large for a residual export." }, { status: 400 });

  const { rows, errors } = parseResidualSettlementsExport(text);
  if (rows.length === 0) return NextResponse.json({ error: errors[0] ?? "Nothing to import.", errors }, { status: 400 });

  let created = 0;
  let updated = 0;
  for (const row of rows) {
    const existing = await prisma.finixResidualSettlement.findUnique({ where: { finixBillingSettlementId: row.finixBillingSettlementId } });
    await prisma.finixResidualSettlement.upsert({
      where: { finixBillingSettlementId: row.finixBillingSettlementId },
      create: { ...row, importedByEmail: session.email },
      update: { ...row, importedByEmail: session.email },
    });
    if (existing) updated++;
    else created++;
  }

  await logBillingAuditEvent({
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "residual_settlements.imported",
    entityType: "FinixResidualSettlement",
    newValue: rows.map((r) => ({
      id: r.finixBillingSettlementId,
      windowStart: r.windowStart.toISOString(),
      totalResidualCents: r.totalResidualCents,
      state: r.state,
    })),
    metadata: { created, updated, skipped: errors.length },
  });

  return NextResponse.json({ created, updated, errors });
}
