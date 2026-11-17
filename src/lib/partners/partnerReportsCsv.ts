import { prisma } from "@/lib/prisma";
import { buildCsvExport, type CsvColumn } from "@/lib/csvExport";
import { loadPartnerVolume, type ClientVolumeRow } from "@/lib/partners/loadPartnerVolume";
import type { CommissionView } from "@/lib/partners/loadCommission";

/**
 * CSV reports for a referral partner, for paying agents. Same scope rules as the Volume and Commission pages:
 * `partnerId` and `agentId` come from the signed-in session, never from a request. Like the Volume page, nothing
 * here carries WGC's fees, the processor's costs, or payer names and emails.
 */

export const NO_AGENT = "(No agent)";

export interface ClientReportRow extends ClientVolumeRow {
  refundsCents: number;
  returnsCents: number;
  refundsCount: number;
  returnsCount: number;
}

/** Each client with its agent, volume split by card and ACH, and its own refunds and ACH returns. Window is [from, to). */
export async function loadClientReport(params: { partnerId: string; agentId?: string; from: Date; to: Date }): Promise<ClientReportRow[]> {
  const volume = await loadPartnerVolume({ partnerId: params.partnerId, agentId: params.agentId, from: params.from, to: params.to });
  const ids = volume.clients.map((c) => c.churchId);
  if (ids.length === 0) return [];

  const [refunds, returns] = await Promise.all([
    prisma.finixRefundOrReversal.groupBy({
      by: ["churchId"],
      where: { churchId: { in: ids }, state: { equals: "SUCCEEDED", mode: "insensitive" }, createdAtFinix: { gte: params.from, lt: params.to } },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
    prisma.bankReturn.groupBy({
      by: ["churchId"],
      where: { churchId: { in: ids }, createdAtFinix: { gte: params.from, lt: params.to } },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
  ]);
  const refundBy = new Map(refunds.map((r) => [r.churchId, r]));
  const returnBy = new Map(returns.map((r) => [r.churchId, r]));

  return volume.clients.map((c) => ({
    ...c,
    refundsCents: refundBy.get(c.churchId)?._sum.amountCents ?? 0,
    refundsCount: refundBy.get(c.churchId)?._count._all ?? 0,
    returnsCents: returnBy.get(c.churchId)?._sum.amountCents ?? 0,
    returnsCount: returnBy.get(c.churchId)?._count._all ?? 0,
  }));
}

const dollars = (cents: number) => (cents / 100).toFixed(2);
const day = (iso: string) => iso.slice(0, 10);
const net = (r: ClientReportRow) => r.totalCents - r.refundsCents - r.returnsCents;

export function clientsCsv(rows: ClientReportRow[], from: Date, to: Date): string {
  const sorted = [...rows].sort((a, b) => (a.agentName ? 0 : 1) - (b.agentName ? 0 : 1) || (a.agentName ?? "").localeCompare(b.agentName ?? "") || a.name.localeCompare(b.name));
  const cols: CsvColumn<ClientReportRow>[] = [
    { header: "Agent", value: (r) => r.agentName ?? NO_AGENT },
    { header: "Client", value: (r) => r.name },
    { header: "Status", value: (r) => (r.status === "ACTIVE" ? "Active" : "Terminated") },
    { header: "Joined", value: (r) => day(r.joinedAt) },
    { header: "Joined in period", value: (r) => (new Date(r.joinedAt) >= from && new Date(r.joinedAt) < to ? "Yes" : "No") },
    { header: "Card volume (USD)", value: (r) => dollars(r.card.amountCents) },
    { header: "Card payments", value: (r) => String(r.card.count) },
    { header: "ACH volume (USD)", value: (r) => dollars(r.ach.amountCents) },
    { header: "ACH payments", value: (r) => String(r.ach.count) },
    { header: "Total volume (USD)", value: (r) => dollars(r.totalCents) },
    { header: "Refunds (USD)", value: (r) => dollars(r.refundsCents) },
    { header: "Refund count", value: (r) => String(r.refundsCount) },
    { header: "ACH returns (USD)", value: (r) => dollars(r.returnsCents) },
    { header: "ACH return count", value: (r) => String(r.returnsCount) },
    { header: "Net volume (USD)", value: (r) => dollars(net(r)) },
  ];
  return buildCsvExport(sorted, cols);
}

export interface AgentReportRow {
  agentName: string;
  clients: number;
  activeClients: number;
  joinedInPeriod: number;
  cardCents: number;
  cardCount: number;
  achCents: number;
  achCount: number;
  totalCents: number;
  refundsCents: number;
  returnsCents: number;
}

/** One row per agent, with clients that have no agent last. */
export function summarizeAgents(rows: ClientReportRow[], from: Date, to: Date): AgentReportRow[] {
  const byKey = new Map<string, AgentReportRow>();
  for (const r of rows) {
    const key = r.agentId ?? "";
    const s = byKey.get(key) ?? { agentName: r.agentName ?? NO_AGENT, clients: 0, activeClients: 0, joinedInPeriod: 0, cardCents: 0, cardCount: 0, achCents: 0, achCount: 0, totalCents: 0, refundsCents: 0, returnsCents: 0 };
    s.clients += 1;
    if (r.status === "ACTIVE") s.activeClients += 1;
    const joined = new Date(r.joinedAt);
    if (joined >= from && joined < to) s.joinedInPeriod += 1;
    s.cardCents += r.card.amountCents;
    s.cardCount += r.card.count;
    s.achCents += r.ach.amountCents;
    s.achCount += r.ach.count;
    s.totalCents += r.totalCents;
    s.refundsCents += r.refundsCents;
    s.returnsCents += r.returnsCents;
    byKey.set(key, s);
  }
  return [...byKey.entries()].sort(([ka, a], [kb, b]) => (ka === "" ? 1 : 0) - (kb === "" ? 1 : 0) || a.agentName.localeCompare(b.agentName)).map(([, s]) => s);
}

export function agentsCsv(rows: AgentReportRow[]): string {
  const cols: CsvColumn<AgentReportRow>[] = [
    { header: "Agent", value: (r) => r.agentName },
    { header: "Clients", value: (r) => String(r.clients) },
    { header: "Active clients", value: (r) => String(r.activeClients) },
    { header: "Joined in period", value: (r) => String(r.joinedInPeriod) },
    { header: "Card volume (USD)", value: (r) => dollars(r.cardCents) },
    { header: "Card payments", value: (r) => String(r.cardCount) },
    { header: "ACH volume (USD)", value: (r) => dollars(r.achCents) },
    { header: "ACH payments", value: (r) => String(r.achCount) },
    { header: "Total volume (USD)", value: (r) => dollars(r.totalCents) },
    { header: "Refunds (USD)", value: (r) => dollars(r.refundsCents) },
    { header: "ACH returns (USD)", value: (r) => dollars(r.returnsCents) },
    { header: "Net volume (USD)", value: (r) => dollars(r.totalCents - r.refundsCents - r.returnsCents) },
  ];
  return buildCsvExport(rows, cols);
}

const STATUS_TEXT: Record<string, string> = { FINAL: "Final", ESTIMATE: "Estimate", AWAITING_STATEMENT: "Awaiting statement" };

/**
 * Commission by month and agent, taken from the same figures as the Commission page (so it already hides what the
 * viewer may not see). A partner's file has the partner's share and what the partner keeps; an agent's file only
 * their own amount. Only months with figures appear.
 */
export function commissionCsv(view: CommissionView): string {
  type Line = { month: string; status: string; agent: string; agentCents: number; carryInCents: number; rateBps: number; partnerCents: number | null; keepsCents: number | null };
  const lines: Line[] = [];
  for (const m of [...view.months].reverse()) {
    for (const l of m.lines) {
      lines.push({ month: m.label, status: STATUS_TEXT[m.status] ?? m.status, agent: l.agentName, agentCents: l.agentCents, carryInCents: l.carryInCents, rateBps: l.agentRateBps, partnerCents: l.partnerCents, keepsCents: l.partnerKeepsCents });
    }
  }
  const forAgent = view.viewer === "agent";
  const cols: CsvColumn<Line>[] = [
    { header: "Month", value: (r) => r.month },
    { header: "Status", value: (r) => r.status },
    { header: "Agent", value: (r) => r.agent },
    { header: "Agent rate (%)", value: (r) => (r.rateBps / 100).toFixed(2) },
    { header: "Carried in (USD)", value: (r) => dollars(r.carryInCents) },
    { header: "Agent commission (USD)", value: (r) => dollars(r.agentCents) },
    ...(forAgent
      ? []
      : ([
          { header: "Partner share of group (USD)", value: (r) => dollars(r.partnerCents ?? 0) },
          { header: "Partner keeps (USD)", value: (r) => dollars(r.keepsCents ?? 0) },
        ] as CsvColumn<Line>[])),
  ];
  return buildCsvExport(lines, cols);
}
