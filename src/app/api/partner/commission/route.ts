import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthError } from "@/lib/auth/errors";
import { requirePartnerWriteSession } from "@/lib/partners/partnerSession";
import { parseCents, parseMonth } from "@/lib/partners/commissionActions";

/**
 * The partner's own record of paying an agent. Partner staff only (an agent's login is refused by the session,
 * and an admin's read-only view can't write). Agents are never paid by WGC, so this is bookkeeping, not a transfer.
 */
export async function POST(req: Request) {
  let session;
  try {
    session = await requirePartnerWriteSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const partnerId = session.partnerId;

  if (body.action === "recordAgentPayout") {
    const month = parseMonth(body.month);
    const amountCents = parseCents(body.amountCents);
    const paidAt = typeof body.paidAt === "string" ? new Date(body.paidAt) : null;
    const agent = await prisma.partnerAgent.findFirst({ where: { id: String(body.agentId ?? ""), partnerId }, select: { id: true } });
    if (!agent) return NextResponse.json({ error: "Agent not found." }, { status: 404 });
    if (!month) return NextResponse.json({ error: "Choose the month the payment is for." }, { status: 400 });
    if (amountCents === null || amountCents <= 0) return NextResponse.json({ error: "Enter the amount paid." }, { status: 400 });
    if (!paidAt || Number.isNaN(paidAt.getTime())) return NextResponse.json({ error: "Enter the date it was paid." }, { status: 400 });
    const row = await prisma.partnerCommissionPayout.create({
      data: {
        partnerId,
        agentId: agent.id,
        month,
        amountCents,
        paidAt,
        method: typeof body.method === "string" ? body.method.trim().slice(0, 60) || null : null,
        note: typeof body.note === "string" ? body.note.trim().slice(0, 300) || null : null,
        recordedByEmail: session.email,
      },
    });
    return NextResponse.json({ id: row.id }, { status: 201 });
  }
  if (body.action === "deleteAgentPayout") {
    const row = await prisma.partnerCommissionPayout.findFirst({ where: { id: String(body.id ?? ""), partnerId, agentId: { not: null } } });
    if (!row) return NextResponse.json({ error: "Payment not found." }, { status: 404 });
    await prisma.partnerCommissionPayout.delete({ where: { id: row.id } });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
