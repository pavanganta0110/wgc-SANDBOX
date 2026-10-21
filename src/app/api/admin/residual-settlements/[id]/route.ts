import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logBillingAuditEvent } from "@/lib/billing/billingAudit";
import { requireResidualManager } from "../auth";

/**
 * Confirms (or un-confirms) that a residual payout reached WGC's bank
 * account. Bookkeeping only: never moves money.
 * Body: { depositReceivedAt: "YYYY-MM-DD" | null, depositNote?: string }
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireResidualManager();
  if ("error" in auth) return auth.error;
  const { session } = auth;
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const raw = body?.depositReceivedAt;
  let depositReceivedAt: Date | null = null;
  if (raw !== null) {
    depositReceivedAt = typeof raw === "string" ? new Date(raw) : null;
    if (!depositReceivedAt || Number.isNaN(depositReceivedAt.getTime()) || depositReceivedAt.getTime() > Date.now() + 86_400_000) {
      return NextResponse.json({ error: "Enter the date the money arrived (not in the future)." }, { status: 400 });
    }
  }
  const depositNote = typeof body?.depositNote === "string" ? body.depositNote.trim().slice(0, 500) || null : null;

  const existing = await prisma.finixResidualSettlement.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Statement not found." }, { status: 404 });

  await prisma.finixResidualSettlement.update({
    where: { id },
    data: { depositReceivedAt, depositNote: depositReceivedAt ? depositNote : null },
  });

  await logBillingAuditEvent({
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: depositReceivedAt ? "residual_settlement.deposit_confirmed" : "residual_settlement.deposit_unconfirmed",
    entityType: "FinixResidualSettlement",
    entityId: id,
    previousValue: { depositReceivedAt: existing.depositReceivedAt?.toISOString() ?? null, depositNote: existing.depositNote },
    newValue: { depositReceivedAt: depositReceivedAt?.toISOString() ?? null, depositNote, finixBillingSettlementId: existing.finixBillingSettlementId },
  });

  return NextResponse.json({ ok: true });
}
