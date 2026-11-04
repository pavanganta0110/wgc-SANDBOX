import { prisma } from "@/lib/prisma";
import { computeCommissionMonths } from "@/lib/partners/loadCommission";

/** "2026-03" -> first day of that month (UTC), or null. */
export function parseMonth(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
  return new Date(`${value}-01T00:00:00.000Z`);
}

export function parseRateBps(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 10_000 ? value : null;
}

export function parseCents(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && Math.abs(value) <= 100_000_000_00 ? value : null;
}

/**
 * Freezes a month's commission so later rate changes or adjustments can't move it. Months are finalized in order:
 * an earlier month still waiting to be finalized would change what this one carries forward.
 */
export async function finalizeMonth(partnerId: string, month: Date, byEmail: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const core = await computeCommissionMonths(partnerId);
  if (!core) return { ok: false, error: "Partner not found." };
  const target = core.computed.find((c) => c.month.getTime() === month.getTime());
  if (!target) return { ok: false, error: "No figures for that month." };
  if (target.status === "FINAL") return { ok: false, error: "That month is already finalized." };
  if (target.status === "AWAITING_STATEMENT" || !target.commission) return { ok: false, error: "That month has no approved processor statement yet, so there is no profit to share." };
  const earlier = core.computed.find((c) => c.month.getTime() < month.getTime() && c.status === "ESTIMATE");
  if (earlier) return { ok: false, error: `Finalize ${earlier.month.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })} first.` };
  const c = target.commission;
  await prisma.partnerCommissionStatement.create({
    data: {
      partnerId,
      month,
      profitCents: c.profitCents,
      wgcCents: c.wgcCents,
      partnerCents: c.partnerCents,
      agentsCents: c.agentsCents,
      partnerKeepsCents: c.partnerKeepsCents,
      linesJson: JSON.parse(JSON.stringify(c)),
      finalizedByEmail: byEmail,
    },
  });
  return { ok: true };
}
