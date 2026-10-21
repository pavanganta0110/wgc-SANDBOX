import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logBillingAuditEvent } from "@/lib/billing/billingAudit";
import { requireResidualManager } from "../auth";

/** Removes a payout entered by mistake. The audit log keeps what was removed. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireResidualManager();
  if ("error" in auth) return auth.error;
  const { session } = auth;
  const { id } = await params;

  const existing = await prisma.finixResidualPayout.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Payout not found." }, { status: 404 });

  await prisma.finixResidualPayout.delete({ where: { id } });
  await logBillingAuditEvent({
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "residual_payout.removed",
    entityType: "FinixResidualPayout",
    entityId: id,
    previousValue: {
      month: existing.periodMonth.toISOString().slice(0, 7),
      amountCents: existing.amountCents,
      receivedAt: existing.receivedAt.toISOString(),
      finixBillingSettlementId: existing.finixBillingSettlementId,
      recordedByEmail: existing.recordedByEmail,
    },
  });

  return NextResponse.json({ ok: true });
}
