import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadResidualLedger } from "@/lib/admin/residuals";
import {
  DEFAULT_AGENT_RATE_BPS,
  DEFAULT_PARTNER_RATE_BPS,
  computeMonthCommission,
  merchantProfitCents,
  rateForMonth,
  splitCents,
  type AgentGroupLine,
  type MerchantProfit,
  type MonthCommission,
} from "@/lib/partners/commission";

/**
 * A partner's commission, month by month, for three audiences who must each see only their own part:
 *
 *  - admin   (WGC super admin): everything, including WGC's share of the profit;
 *  - partner (the partner's own staff): their share (for example 35%) and how it divides between agents and them;
 *  - agent   (a partner's agent login): only their own amount and their own organizations.
 *
 * Profit comes from Finix's monthly residual statements (the only real source of Finix's cost): each organization's
 * share of a month's statement is its share of the fees WGC charged that month, plus any WGC adjustment for
 * chargebacks or refunds. A month with no approved statement yet has no profit, so nothing is shown as earned.
 * A month WGC has finalized is read back from its frozen statement, so a later rate change can't alter it.
 */

export type CommissionViewer = { kind: "admin" } | { kind: "partner" } | { kind: "agent"; agentId: string };
export type MonthStatus = "FINAL" | "ESTIMATE" | "AWAITING_STATEMENT";

export interface CommissionLineView {
  agentId: string | null;
  agentName: string;
  /** Admin only. */
  profitCents: number | null;
  carryInCents: number;
  /** The agent's own amount. */
  agentCents: number;
  /** Admin and partner only: the partner's whole share of this group, and what the partner keeps from it. */
  partnerCents: number | null;
  partnerKeepsCents: number | null;
  agentRateBps: number;
}

export interface CommissionMonthView {
  month: string;
  label: string;
  status: MonthStatus;
  partnerRateBps: number | null;
  /** Admin only. */
  profitCents: number | null;
  wgcCents: number | null;
  /** Admin and partner. */
  partnerCents: number | null;
  agentsCents: number | null;
  partnerKeepsCents: number | null;
  /** What the viewer earns this month: the partner share (admin, partner) or the agent's own amount (agent). */
  yourCents: number | null;
  lines: CommissionLineView[];
}

export interface CommissionPayoutView {
  id: string;
  agentId: string | null;
  agentName: string | null;
  month: string;
  amountCents: number;
  paidAt: string;
  method: string | null;
  note: string | null;
}

export interface MerchantCommissionRow {
  churchId: string;
  name: string;
  agentId: string | null;
  agentName: string | null;
  /** Admin only. */
  profitCents: number | null;
  /** The viewer's commission from this organization this month. */
  yourCents: number | null;
}

export interface CommissionView {
  partner: { id: string; name: string };
  viewer: CommissionViewer["kind"];
  partnerRateBps: number;
  agents: { id: string; name: string; email: string | null; status: string; rateBps: number; organizations: number; hasLogin: boolean }[];
  months: CommissionMonthView[];
  /** Newest month with an approved statement, which the per-organization table shows. */
  organizationsMonth: string | null;
  organizations: MerchantCommissionRow[];
  /** Every linked organization and its agent: for assigning. Not given to an agent. */
  allOrganizations: { churchId: string; name: string; agentId: string | null }[];
  payouts: CommissionPayoutView[];
  totals: {
    /** Earned in FINAL months. */
    finalCents: number;
    /** Calculated for months not finalized yet. */
    estimateCents: number;
    paidCents: number;
    /** Final minus paid. */
    owedCents: number;
  };
  /** Partner view: what the partner still owes each agent. Admin view: same. */
  owedToAgents: { agentId: string; agentName: string; finalCents: number; paidCents: number; owedCents: number }[];
  monthsAwaitingStatement: number;
  adjustments: { id: string; churchId: string; churchName: string; month: string; amountCents: number; reason: string }[];
}

const monthStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const addMonths = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
const keyOf = (d: Date) => monthStart(d).toISOString();
const label = (d: Date) => d.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

interface StoredStatement {
  commission: MonthCommission;
}

type Computed = { month: Date; status: MonthStatus; commission: MonthCommission | null; merchants: MerchantProfit[] };

/** The raw month-by-month figures (every amount, including WGC's), before anything is hidden from a viewer. */
export async function computeCommissionMonths(partnerId: string, now: Date = new Date()) {
  const partner = await prisma.partner.findUnique({ where: { id: partnerId }, select: { id: true, name: true } });
  if (!partner) return null;

  const [agentsAll, terms, churches, statementsStored, payoutRows, adjustmentRows, loginRows] = await Promise.all([
    prisma.partnerAgent.findMany({ where: { partnerId }, orderBy: { name: "asc" } }),
    prisma.partnerRateTerm.findMany({ where: { partnerId } }),
    prisma.church.findMany({ where: { partnerId }, select: { id: true, name: true, partnerAgentId: true } }),
    prisma.partnerCommissionStatement.findMany({ where: { partnerId } }),
    prisma.partnerCommissionPayout.findMany({ where: { partnerId }, orderBy: [{ month: "desc" }, { paidAt: "desc" }] }),
    prisma.partnerProfitAdjustment.findMany({ where: { partnerId }, orderBy: { month: "desc" } }),
    prisma.partnerUser.findMany({ where: { partnerId, agentId: { not: null } }, select: { agentId: true } }),
  ]);
  const agentName = new Map(agentsAll.map((a) => [a.id, a.name]));
  const churchName = new Map(churches.map((c) => [c.id, c.name]));
  const ids = churches.map((c) => c.id);
  const rateTerms = terms.map((t) => ({ agentId: t.agentId, effectiveFrom: t.effectiveFrom, rateBps: t.rateBps }));
  const partnerRate = (m: Date) => rateForMonth(rateTerms, null, m, DEFAULT_PARTNER_RATE_BPS);
  const agentRate = (id: string, m: Date) => rateForMonth(rateTerms, id, m, DEFAULT_AGENT_RATE_BPS);
  const thisMonth = monthStart(now);

  // Each organization's fees charged by WGC, per month.
  const chargedRows = ids.length
    ? await prisma.$queryRaw<{ church_id: string; month: Date; charged: number | null }[]>(Prisma.sql`
        SELECT p."churchId" AS church_id, date_trunc('month', p."createdAt") AS month,
               SUM(ROUND(COALESCE(p."donationAmountCents", 0)::numeric * COALESCE(p."percentageBps", 0) / 10000) + COALESCE(p."fixedFeeCents", 0))::float8 AS charged
        FROM "Payment" p
        WHERE p."status" = 'SUCCEEDED' AND p."churchId" IN (${Prisma.join(ids)})
        GROUP BY 1, 2`)
    : [];
  const chargedBy = new Map<string, number>(); // `${month}|${churchId}`
  for (const r of chargedRows) chargedBy.set(`${keyOf(new Date(r.month))}|${r.church_id}`, Math.round(r.charged ?? 0));
  const adjustmentBy = new Map<string, number>();
  for (const a of adjustmentRows) adjustmentBy.set(`${keyOf(a.month)}|${a.churchId}`, (adjustmentBy.get(`${keyOf(a.month)}|${a.churchId}`) ?? 0) + a.amountCents);

  const ledger = ids.length || statementsStored.length ? await loadResidualLedger(now) : null;
  const platform = new Map((ledger?.months ?? []).map((m) => [m.month, m]));
  const stored = new Map<string, StoredStatement>(statementsStored.map((s) => [keyOf(s.month), { commission: s.linesJson as unknown as MonthCommission }]));

  const firstKeys = [...chargedBy.keys()].map((k) => k.split("|")[0]!).concat([...stored.keys()], [...adjustmentBy.keys()].map((k) => k.split("|")[0]!)).sort();
  const first = firstKeys[0] ? new Date(firstKeys[0]) : thisMonth;

  const ownerOf = new Map(churches.map((c) => [c.id, c.partnerAgentId]));
  let carry = new Map<string, number>();
  const computed: Computed[] = [];
  for (let m = first; m <= thisMonth; m = addMonths(m, 1)) {
    const k = m.toISOString();
    const frozen = stored.get(k);
    if (frozen) {
      carry = new Map(frozen.commission.lines.filter((l) => l.carryOutCents < 0).map((l) => [l.agentId ?? "", l.carryOutCents]));
      computed.push({ month: m, status: "FINAL", commission: frozen.commission, merchants: [] });
      continue;
    }
    const p = platform.get(k);
    const statement = p?.statement && p.statement.state === "APPROVED" ? p.statement : null;
    if (!statement) {
      computed.push({ month: m, status: "AWAITING_STATEMENT", commission: null, merchants: [] });
      continue;
    }
    const merchants: MerchantProfit[] = churches.map((c) => ({
      churchId: c.id,
      agentId: ownerOf.get(c.id) ?? null,
      profitCents: merchantProfitCents({
        merchantChargedCents: chargedBy.get(`${k}|${c.id}`) ?? 0,
        platformChargedCents: p?.wgcChargedCents ?? 0,
        platformResidualCents: statement.totalResidualCents,
        adjustmentCents: adjustmentBy.get(`${k}|${c.id}`) ?? 0,
      }),
    }));
    const commission = computeMonthCommission({ merchants: merchants.filter((x) => x.profitCents !== 0), partnerRateBps: partnerRate(m), agentRateBps: (id) => agentRate(id, m), carryIn: carry });
    carry = new Map(commission.lines.filter((l) => l.carryOutCents < 0).map((l) => [l.agentId ?? "", l.carryOutCents]));
    computed.push({ month: m, status: "ESTIMATE", commission, merchants });
  }

  return { partner, agentsAll, agentName, churchName, churches, payoutRows, adjustmentRows, loginRows, computed, partnerRate, agentRate, thisMonth };
}

export async function loadCommission(partnerId: string, viewer: CommissionViewer, now: Date = new Date()): Promise<CommissionView | null> {
  const core = await computeCommissionMonths(partnerId, now);
  if (!core) return null;
  const { partner, agentsAll, agentName, churchName, churches, payoutRows, adjustmentRows, loginRows, computed, partnerRate, agentRate, thisMonth } = core;

  const visible = (l: AgentGroupLine) => viewer.kind !== "agent" || l.agentId === viewer.agentId;
  const toLine = (l: AgentGroupLine): CommissionLineView => ({
    agentId: l.agentId,
    agentName: l.agentId ? (agentName.get(l.agentId) ?? "Removed agent") : "No agent",
    profitCents: viewer.kind === "admin" ? l.profitCents : null,
    carryInCents: l.carryInCents,
    agentCents: l.agentCents,
    partnerCents: viewer.kind === "agent" ? null : l.partnerCents,
    partnerKeepsCents: viewer.kind === "agent" ? null : l.partnerKeepsCents,
    agentRateBps: l.agentRateBps,
  });

  const months: CommissionMonthView[] = computed
    .map(({ month, status, commission }): CommissionMonthView => {
      if (!commission) {
        return { month: month.toISOString(), label: label(month), status, partnerRateBps: null, profitCents: null, wgcCents: null, partnerCents: null, agentsCents: null, partnerKeepsCents: null, yourCents: null, lines: [] };
      }
      const lines = commission.lines.filter(visible).map(toLine);
      const agentOnly = viewer.kind === "agent";
      const mine = agentOnly ? commission.lines.filter(visible).reduce((a, l) => a + l.agentCents, 0) : commission.partnerCents;
      return {
        month: month.toISOString(),
        label: label(month),
        status,
        partnerRateBps: agentOnly ? null : commission.partnerRateBps,
        profitCents: viewer.kind === "admin" ? commission.profitCents : null,
        wgcCents: viewer.kind === "admin" ? commission.wgcCents : null,
        partnerCents: agentOnly ? null : commission.partnerCents,
        agentsCents: agentOnly ? null : commission.agentsCents,
        partnerKeepsCents: agentOnly ? null : commission.partnerKeepsCents,
        yourCents: mine,
        lines,
      };
    })
    .reverse();

  // Money: only FINAL months count as owed.
  const wanted = (agentId: string | null) => (viewer.kind === "agent" ? agentId === viewer.agentId : true);
  const sumLines = (status: MonthStatus, pick: (l: AgentGroupLine) => number, only?: (l: AgentGroupLine) => boolean) =>
    computed.filter((c) => c.status === status && c.commission).reduce((a, c) => a + c.commission!.lines.filter((l) => !only || only(l)).reduce((x, l) => x + pick(l), 0), 0);
  const mineFilter = viewer.kind === "agent" ? (l: AgentGroupLine) => l.agentId === viewer.agentId : undefined;
  const pickMine = viewer.kind === "agent" ? (l: AgentGroupLine) => l.agentCents : (l: AgentGroupLine) => l.partnerCents;
  const finalCents = sumLines("FINAL", pickMine, mineFilter);
  const estimateCents = sumLines("ESTIMATE", pickMine, mineFilter);
  const paid = payoutRows.filter((p) => (viewer.kind === "agent" ? p.agentId === viewer.agentId : p.agentId === null));
  const paidCents = paid.reduce((a, p) => a + p.amountCents, 0);

  const owedToAgents = agentsAll
    .filter((a) => wanted(a.id))
    .map((a) => {
      const finalAmount = sumLines("FINAL", (l) => l.agentCents, (l) => l.agentId === a.id);
      const paidAmount = payoutRows.filter((p) => p.agentId === a.id).reduce((x, p) => x + p.amountCents, 0);
      return { agentId: a.id, agentName: a.name, finalCents: finalAmount, paidCents: paidAmount, owedCents: finalAmount - paidAmount };
    });

  // The newest month with figures, for the per-organization table.
  const latest = [...computed].reverse().find((c) => c.status === "ESTIMATE");
  const organizations: MerchantCommissionRow[] = [];
  if (latest && latest.commission) {
    const lineByAgent = new Map(latest.commission.lines.map((l) => [l.agentId ?? "", l]));
    const byGroup = new Map<string, MerchantProfit[]>();
    for (const m of latest.merchants) byGroup.set(m.agentId ?? "", [...(byGroup.get(m.agentId ?? "") ?? []), m]);
    for (const [key, group] of byGroup) {
      const line = lineByAgent.get(key);
      if (!line) continue;
      const weights = group.map((g) => Math.max(0, g.profitCents));
      const own = viewer.kind === "agent" ? line.agentCents : line.partnerCents;
      const shares = splitCents(own, weights);
      group.forEach((g, i) => {
        if (viewer.kind === "agent" && g.agentId !== viewer.agentId) return;
        organizations.push({
          churchId: g.churchId,
          name: churchName.get(g.churchId) ?? "Organization",
          agentId: g.agentId,
          agentName: g.agentId ? (agentName.get(g.agentId) ?? null) : null,
          profitCents: viewer.kind === "admin" ? g.profitCents : null,
          yourCents: shares[i] ?? 0,
        });
      });
    }
    organizations.sort((a, b) => (b.yourCents ?? 0) - (a.yourCents ?? 0) || a.name.localeCompare(b.name));
  }

  const loginAgents = new Set(loginRows.map((r) => r.agentId));
  const orgsPerAgent = new Map<string, number>();
  for (const c of churches) if (c.partnerAgentId) orgsPerAgent.set(c.partnerAgentId, (orgsPerAgent.get(c.partnerAgentId) ?? 0) + 1);

  const current = partnerRate(thisMonth);
  return {
    partner,
    viewer: viewer.kind,
    partnerRateBps: current,
    agents: agentsAll
      .filter((a) => wanted(a.id))
      .map((a) => ({ id: a.id, name: a.name, email: viewer.kind === "agent" ? null : a.email, status: a.status, rateBps: agentRate(a.id, thisMonth), organizations: orgsPerAgent.get(a.id) ?? 0, hasLogin: loginAgents.has(a.id) })),
    months,
    organizationsMonth: latest ? latest.month.toISOString() : null,
    organizations,
    allOrganizations: viewer.kind === "agent" ? [] : churches.map((c) => ({ churchId: c.id, name: c.name, agentId: c.partnerAgentId })).sort((a, b) => a.name.localeCompare(b.name)),
    payouts: payoutRows
      .filter((p) => (viewer.kind === "agent" ? p.agentId === viewer.agentId : true))
      .map((p) => ({ id: p.id, agentId: p.agentId, agentName: p.agentId ? (agentName.get(p.agentId) ?? null) : null, month: p.month.toISOString(), amountCents: p.amountCents, paidAt: p.paidAt.toISOString(), method: p.method, note: p.note })),
    totals: { finalCents, estimateCents, paidCents, owedCents: finalCents - paidCents },
    owedToAgents: viewer.kind === "agent" ? [] : owedToAgents,
    monthsAwaitingStatement: computed.filter((c) => c.status === "AWAITING_STATEMENT" && c.month < thisMonth).length,
    adjustments: viewer.kind === "admin" ? adjustmentRows.map((a) => ({ id: a.id, churchId: a.churchId, churchName: churchName.get(a.churchId) ?? "Organization", month: a.month.toISOString(), amountCents: a.amountCents, reason: a.reason })) : [],
  };
}
