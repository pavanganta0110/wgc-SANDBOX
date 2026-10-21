import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logBillingAuditEvent } from "@/lib/billing/billingAudit";
import { requireResidualManager } from "./auth";

/**
 * Records a Finix platform-residual payout WGC received. Bookkeeping only:
 * Finix has no billing-settlement API, so this is how the admin dashboard
 * knows a month's residual was actually paid. Never moves money.
 */
export async function POST(req: Request) {
  const auth = await requireResidualManager();
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const body = await req.json().catch(() => ({}));
  const { month, amountCents, receivedAt, finixBillingSettlementId, note } = body ?? {};

  if (typeof month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return NextResponse.json({ error: "Choose the month this payout covers." }, { status: 400 });
  }
  if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > 100_000_000_00) {
    return NextResponse.json({ error: "Enter the amount received." }, { status: 400 });
  }
  const received = typeof receivedAt === "string" ? new Date(receivedAt) : null;
  if (!received || Number.isNaN(received.getTime()) || received.getTime() > Date.now() + 86_400_000) {
    return NextResponse.json({ error: "Enter the date the money arrived (not in the future)." }, { status: 400 });
  }
  const [y, m] = month.split("-").map(Number);
  const periodMonth = new Date(Date.UTC(y, m - 1, 1));
  if (periodMonth.getTime() > Date.now()) {
    return NextResponse.json({ error: "That month hasn't started yet." }, { status: 400 });
  }
  const settlementId = typeof finixBillingSettlementId === "string" ? finixBillingSettlementId.trim().slice(0, 100) || null : null;
  const cleanNote = typeof note === "string" ? note.trim().slice(0, 500) || null : null;

  const created = await prisma.finixResidualPayout.create({
    data: {
      periodMonth,
      amountCents,
      receivedAt: received,
      finixBillingSettlementId: settlementId,
      note: cleanNote,
      recordedByUserId: session.userId,
      recordedByEmail: session.email,
    },
  });

  await logBillingAuditEvent({
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "residual_payout.recorded",
    entityType: "FinixResidualPayout",
    entityId: created.id,
    newValue: { month, amountCents, receivedAt: received.toISOString(), finixBillingSettlementId: settlementId },
    internalReason: cleanNote ?? undefined,
  });

  return NextResponse.json({ id: created.id }, { status: 201 });
}
