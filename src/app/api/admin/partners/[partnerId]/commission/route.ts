import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { requirePartnerAdmin } from "@/lib/partners/requirePartnerAdmin";
import { loadCommission } from "@/lib/partners/loadCommission";
import { finalizeMonth, parseCents, parseMonth, parseRateBps } from "@/lib/partners/commissionActions";

export const dynamic = "force-dynamic";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function GET(_req: Request, { params }: { params: Promise<{ partnerId: string }> }) {
  const auth = await requirePartnerAdmin();
  if ("response" in auth) return auth.response;
  const { partnerId } = await params;
  const data = await loadCommission(partnerId, { kind: "admin" });
  if (!data) return bad("Partner not found.", 404);
  return NextResponse.json(data);
}

/** Every change to a partner's commission setup, money and records. WGC super admins only; each is audited. */
export async function POST(req: Request, { params }: { params: Promise<{ partnerId: string }> }) {
  const auth = await requirePartnerAdmin();
  if ("response" in auth) return auth.response;
  const { partnerId } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const email = auth.session.email;
  const audit = (action: string, metadata: Record<string, unknown>) =>
    createAuditLog({ action, actorEmail: email, metadata: { partnerId, ...metadata } });

  if (!(await prisma.partner.findUnique({ where: { id: partnerId }, select: { id: true } }))) return bad("Partner not found.", 404);
  const ownsAgent = async (agentId: unknown) =>
    typeof agentId === "string" && !!(await prisma.partnerAgent.findFirst({ where: { id: agentId, partnerId }, select: { id: true } }));

  switch (body.action) {
    case "addAgent": {
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
      const agentEmail = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 200) : "";
      if (!name) return bad("Enter the agent's name.");
      const agent = await prisma.partnerAgent.create({ data: { partnerId, name, email: agentEmail || null } });
      await audit("PARTNER_AGENT_ADDED", { agentId: agent.id, name });
      return NextResponse.json({ id: agent.id }, { status: 201 });
    }
    case "updateAgent": {
      if (!(await ownsAgent(body.agentId))) return bad("Agent not found.", 404);
      const data: { name?: string; email?: string | null; status?: string } = {};
      if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 120);
      if (typeof body.email === "string") data.email = body.email.trim().toLowerCase().slice(0, 200) || null;
      if (body.status === "ACTIVE" || body.status === "INACTIVE") data.status = body.status;
      await prisma.partnerAgent.update({ where: { id: body.agentId as string }, data });
      await audit("PARTNER_AGENT_UPDATED", { agentId: body.agentId, ...data });
      return NextResponse.json({ ok: true });
    }
    case "setRate": {
      const rateBps = parseRateBps(body.rateBps);
      const from = parseMonth(body.effectiveFrom);
      if (rateBps === null) return bad("The rate must be between 0% and 100%.");
      if (!from) return bad("Choose the month the rate starts.");
      const agentId = body.agentId === null || body.agentId === undefined || body.agentId === "" ? null : (body.agentId as string);
      if (agentId && !(await ownsAgent(agentId))) return bad("Agent not found.", 404);
      // A month that is already finalized keeps the rate it was frozen with; a new rate can only start after it.
      const lastFinal = await prisma.partnerCommissionStatement.findFirst({ where: { partnerId }, orderBy: { month: "desc" }, select: { month: true } });
      if (lastFinal && from.getTime() <= lastFinal.month.getTime()) return bad("That month is already finalized. Start the new rate in a later month.");
      await prisma.partnerRateTerm.create({ data: { partnerId, agentId, effectiveFrom: from, rateBps, createdByEmail: email } });
      await audit("PARTNER_RATE_SET", { agentId, rateBps, effectiveFrom: from.toISOString() });
      return NextResponse.json({ ok: true }, { status: 201 });
    }
    case "assign": {
      const agentId = body.agentId === null || body.agentId === "" ? null : body.agentId;
      if (agentId !== null && !(await ownsAgent(agentId))) return bad("Agent not found.", 404);
      const church = await prisma.church.findFirst({ where: { id: String(body.churchId ?? ""), partnerId }, select: { id: true } });
      if (!church) return bad("That organization is not linked to this partner.", 404);
      await prisma.church.update({ where: { id: church.id }, data: { partnerAgentId: agentId as string | null } });
      await audit("PARTNER_ORG_ASSIGNED", { churchId: church.id, agentId });
      return NextResponse.json({ ok: true });
    }
    case "addAdjustment": {
      const month = parseMonth(body.month);
      const amountCents = parseCents(body.amountCents);
      const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";
      if (!month) return bad("Choose the month.");
      if (amountCents === null || amountCents === 0) return bad("Enter an amount (negative to reduce profit).");
      if (!reason) return bad("Give a reason, for example the chargeback it covers.");
      const church = await prisma.church.findFirst({ where: { id: String(body.churchId ?? ""), partnerId }, select: { id: true } });
      if (!church) return bad("That organization is not linked to this partner.", 404);
      if (await prisma.partnerCommissionStatement.findUnique({ where: { partnerId_month: { partnerId, month } }, select: { id: true } })) {
        return bad("That month is already finalized, so it can't change.");
      }
      const row = await prisma.partnerProfitAdjustment.create({ data: { partnerId, churchId: church.id, month, amountCents, reason, createdByEmail: email } });
      await audit("PARTNER_PROFIT_ADJUSTED", { adjustmentId: row.id, churchId: church.id, month: month.toISOString(), amountCents, reason });
      return NextResponse.json({ id: row.id }, { status: 201 });
    }
    case "deleteAdjustment": {
      const row = await prisma.partnerProfitAdjustment.findFirst({ where: { id: String(body.id ?? ""), partnerId } });
      if (!row) return bad("Adjustment not found.", 404);
      if (await prisma.partnerCommissionStatement.findUnique({ where: { partnerId_month: { partnerId, month: row.month } }, select: { id: true } })) {
        return bad("That month is already finalized, so it can't change.");
      }
      await prisma.partnerProfitAdjustment.delete({ where: { id: row.id } });
      await audit("PARTNER_PROFIT_ADJUSTMENT_REMOVED", { adjustmentId: row.id });
      return NextResponse.json({ ok: true });
    }
    case "finalizeMonth": {
      const month = parseMonth(body.month);
      if (!month) return bad("Choose the month.");
      const result = await finalizeMonth(partnerId, month, email);
      if (!result.ok) return bad(result.error, 409);
      await audit("PARTNER_COMMISSION_FINALIZED", { month: month.toISOString() });
      return NextResponse.json({ ok: true });
    }
    case "recordPayout": {
      const month = parseMonth(body.month);
      const amountCents = parseCents(body.amountCents);
      const paidAt = typeof body.paidAt === "string" ? new Date(body.paidAt) : null;
      // Admin records what WGC paid the partner; paying an agent is the partner's own record.
      if (!month) return bad("Choose the month the payment is for.");
      if (amountCents === null || amountCents <= 0) return bad("Enter the amount paid.");
      if (!paidAt || Number.isNaN(paidAt.getTime())) return bad("Enter the date it was paid.");
      const row = await prisma.partnerCommissionPayout.create({
        data: {
          partnerId,
          agentId: null,
          month,
          amountCents,
          paidAt,
          method: typeof body.method === "string" ? body.method.trim().slice(0, 60) || null : null,
          note: typeof body.note === "string" ? body.note.trim().slice(0, 300) || null : null,
          recordedByEmail: email,
        },
      });
      await audit("PARTNER_COMMISSION_PAID", { payoutId: row.id, month: month.toISOString(), amountCents });
      return NextResponse.json({ id: row.id }, { status: 201 });
    }
    case "deletePayout": {
      const row = await prisma.partnerCommissionPayout.findFirst({ where: { id: String(body.id ?? ""), partnerId, agentId: null } });
      if (!row) return bad("Payment not found.", 404);
      await prisma.partnerCommissionPayout.delete({ where: { id: row.id } });
      await audit("PARTNER_COMMISSION_PAYOUT_REMOVED", { payoutId: row.id });
      return NextResponse.json({ ok: true });
    }
    default:
      return bad("Unknown action.");
  }
}
