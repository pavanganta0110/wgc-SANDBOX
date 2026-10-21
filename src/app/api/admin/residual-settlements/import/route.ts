import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logBillingAuditEvent } from "@/lib/billing/billingAudit";
import { detectExportKind, parseBillingTransfersExport, parseResidualSettlementsExport } from "@/lib/admin/residualSettlementImport";
import { requireResidualManager } from "../auth";

const MAX_TEXT_LENGTH = 500_000;

/**
 * Imports one of Finix's residual dashboard exports (CSV or pasted table):
 * "Residual Settlements" (monthly statements) or "Billing Transfers" (the
 * actual payouts/collections). Upserts by Finix ID, so re-importing is safe:
 * amounts and state are refreshed, and an admin's "deposit received"
 * confirmation is never overwritten. Bookkeeping only.
 */
export async function POST(req: Request) {
  const auth = await requireResidualManager();
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const body = await req.json().catch(() => ({}));
  const text = typeof body?.text === "string" ? body.text : "";
  if (!text.trim()) return NextResponse.json({ error: "Paste or upload a Finix residual export." }, { status: 400 });
  if (text.length > MAX_TEXT_LENGTH) return NextResponse.json({ error: "That file is too large for a residual export." }, { status: 400 });

  const kind = detectExportKind(text);
  if (!kind) {
    return NextResponse.json(
      { error: "This doesn't look like Finix's Residual Settlements or Billing Transfers export." },
      { status: 400 },
    );
  }

  let created = 0;
  let updated = 0;
  let errors: string[];
  let audited: unknown[];

  if (kind === "RESIDUAL_SETTLEMENTS") {
    const parsed = parseResidualSettlementsExport(text);
    errors = parsed.errors;
    if (parsed.rows.length === 0) return NextResponse.json({ error: errors[0] ?? "Nothing to import.", errors }, { status: 400 });
    for (const row of parsed.rows) {
      const existing = await prisma.finixResidualSettlement.findUnique({ where: { finixBillingSettlementId: row.finixBillingSettlementId } });
      await prisma.finixResidualSettlement.upsert({
        where: { finixBillingSettlementId: row.finixBillingSettlementId },
        create: { ...row, importedByEmail: session.email },
        update: { ...row, importedByEmail: session.email },
      });
      if (existing) updated++;
      else created++;
    }
    audited = parsed.rows.map((r) => ({ id: r.finixBillingSettlementId, windowStart: r.windowStart.toISOString(), totalResidualCents: r.totalResidualCents, state: r.state }));
  } else {
    const parsed = parseBillingTransfersExport(text);
    errors = parsed.errors;
    if (parsed.rows.length === 0) return NextResponse.json({ error: errors[0] ?? "Nothing to import.", errors }, { status: 400 });
    for (const row of parsed.rows) {
      const existing = await prisma.finixBillingTransfer.findUnique({ where: { finixBillingTransferId: row.finixBillingTransferId } });
      await prisma.finixBillingTransfer.upsert({
        where: { finixBillingTransferId: row.finixBillingTransferId },
        create: { ...row, importedByEmail: session.email },
        update: { ...row, importedByEmail: session.email },
      });
      if (existing) updated++;
      else created++;
    }
    audited = parsed.rows.map((r) => ({ id: r.finixBillingTransferId, createdAt: r.createdAtFinix.toISOString(), amountCents: r.amountCents, depositType: r.depositType, state: r.state }));
  }

  await logBillingAuditEvent({
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: kind === "RESIDUAL_SETTLEMENTS" ? "residual_settlements.imported" : "billing_transfers.imported",
    entityType: kind === "RESIDUAL_SETTLEMENTS" ? "FinixResidualSettlement" : "FinixBillingTransfer",
    newValue: audited,
    metadata: { created, updated, skipped: errors.length },
  });

  return NextResponse.json({ kind, created, updated, errors });
}
