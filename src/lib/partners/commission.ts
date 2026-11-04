/**
 * How WGC's profit from a partner's organizations is shared. Pure arithmetic; nothing here reads the database.
 *
 *   profit (per organization, per month)
 *     -> WGC keeps (100% - partner rate), the partner earns the partner rate (for example 35%)
 *     -> of the partner's share, each agent gets the agent's rate (for example 80%) for the organizations
 *        they brought in; the partner keeps the remainder (20%) plus all of it for organizations with no agent.
 *
 * A month that comes out negative pays nobody and is carried into the next month for the same agent (or the
 * unassigned group), so a bad month is made up before anything is paid again. Every split is rounded with the
 * largest-remainder rule so the cents always add up to the whole.
 */

export const BPS = 10_000;
export const DEFAULT_PARTNER_RATE_BPS = 3_500;
export const DEFAULT_AGENT_RATE_BPS = 8_000;

export interface RateTerm {
  agentId: string | null;
  /** First day of the first month it applies to. */
  effectiveFrom: Date;
  rateBps: number;
}

/** The rate in force for a month: the latest term starting on or before it, else the fallback. */
export function rateForMonth(terms: RateTerm[], agentId: string | null, month: Date, fallbackBps: number): number {
  let best: RateTerm | null = null;
  for (const t of terms) {
    if (t.agentId !== agentId || t.effectiveFrom.getTime() > month.getTime()) continue;
    if (!best || t.effectiveFrom.getTime() >= best.effectiveFrom.getTime()) best = t;
  }
  return best ? best.rateBps : fallbackBps;
}

/** Splits `totalCents` by `weights`, handing the leftover cents to the largest remainders. Weights must be >= 0. */
export function splitCents(totalCents: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0) return [];
  if (sum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (totalCents * w) / sum);
  const floors = raw.map(Math.floor);
  let left = totalCents - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, rem: r - Math.floor(r) })).sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i] += 1;
    left -= 1;
  }
  return floors;
}

export interface MerchantProfit {
  churchId: string;
  /** Null = the organization has no agent. */
  agentId: string | null;
  /** The organization's profit for the month, after any adjustment. May be negative. */
  profitCents: number;
}

export interface AgentGroupLine {
  /** Null = organizations with no agent. */
  agentId: string | null;
  profitCents: number;
  /** A negative amount brought over from earlier months. */
  carryInCents: number;
  /** Profit shared this month: profit plus carry-in, never below zero. */
  sharedCents: number;
  /** What is carried into the next month (zero or negative). */
  carryOutCents: number;
  wgcCents: number;
  partnerCents: number;
  agentCents: number;
  partnerKeepsCents: number;
  agentRateBps: number;
}

export interface MonthCommission {
  partnerRateBps: number;
  lines: AgentGroupLine[];
  profitCents: number;
  wgcCents: number;
  partnerCents: number;
  agentsCents: number;
  partnerKeepsCents: number;
}

/** One month for one partner. `carryIn` maps agent id (or "" for unassigned) to a negative amount. */
export function computeMonthCommission(input: {
  merchants: MerchantProfit[];
  partnerRateBps: number;
  /** The agent rate in force this month for each agent. */
  agentRateBps: (agentId: string) => number;
  carryIn?: Map<string, number>;
}): MonthCommission {
  const groups = new Map<string, { agentId: string | null; profit: number }>();
  for (const m of input.merchants) {
    const key = m.agentId ?? "";
    const g = groups.get(key) ?? { agentId: m.agentId, profit: 0 };
    g.profit += m.profitCents;
    groups.set(key, g);
  }
  // A group that only has carry from a quiet month still has to be worked off.
  for (const [key, carry] of input.carryIn ?? []) if (carry < 0 && !groups.has(key)) groups.set(key, { agentId: key || null, profit: 0 });

  const lines: AgentGroupLine[] = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, g]) => {
      const carryInCents = Math.min(0, input.carryIn?.get(key) ?? 0);
      const net = g.profit + carryInCents;
      const sharedCents = Math.max(0, net);
      const carryOutCents = Math.min(0, net);
      const [partnerCents, wgcCents] = splitCents(sharedCents, [input.partnerRateBps, BPS - input.partnerRateBps]);
      const agentRateBps = g.agentId ? input.agentRateBps(g.agentId) : 0;
      const [agentCents, partnerKeepsCents] = splitCents(partnerCents, [agentRateBps, BPS - agentRateBps]);
      return {
        agentId: g.agentId,
        profitCents: g.profit,
        carryInCents,
        sharedCents,
        carryOutCents,
        wgcCents: wgcCents ?? 0,
        partnerCents: partnerCents ?? 0,
        agentCents: agentCents ?? 0,
        partnerKeepsCents: partnerKeepsCents ?? 0,
        agentRateBps,
      };
    });
  const sum = (pick: (l: AgentGroupLine) => number) => lines.reduce((a, l) => a + pick(l), 0);
  return {
    partnerRateBps: input.partnerRateBps,
    lines,
    profitCents: sum((l) => l.profitCents),
    wgcCents: sum((l) => l.wgcCents),
    partnerCents: sum((l) => l.partnerCents),
    agentsCents: sum((l) => l.agentCents),
    partnerKeepsCents: sum((l) => l.partnerKeepsCents),
  };
}

/** Runs consecutive months, carrying each group's shortfall forward. `months` must be in order. */
export function computeCommissionRun(
  months: { month: Date; merchants: MerchantProfit[] }[],
  rates: { partnerRateBps: (month: Date) => number; agentRateBps: (agentId: string, month: Date) => number }
): { month: Date; commission: MonthCommission }[] {
  let carry = new Map<string, number>();
  return months.map(({ month, merchants }) => {
    const commission = computeMonthCommission({
      merchants,
      partnerRateBps: rates.partnerRateBps(month),
      agentRateBps: (id) => rates.agentRateBps(id, month),
      carryIn: carry,
    });
    carry = new Map(commission.lines.filter((l) => l.carryOutCents < 0).map((l) => [l.agentId ?? "", l.carryOutCents]));
    return { month, commission };
  });
}

/** A merchant's profit: its share of the platform's profit for the month (by the fees WGC charged), plus adjustments. */
export function merchantProfitCents(params: {
  merchantChargedCents: number;
  platformChargedCents: number;
  platformResidualCents: number;
  adjustmentCents: number;
}): number {
  const share = params.platformChargedCents > 0 ? Math.min(1, params.merchantChargedCents / params.platformChargedCents) : 0;
  return Math.round(share * params.platformResidualCents) + params.adjustmentCents;
}
