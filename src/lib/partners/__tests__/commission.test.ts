import { describe, it, expect } from "vitest";
import {
  computeCommissionRun,
  computeMonthCommission,
  merchantProfitCents,
  rateForMonth,
  splitCents,
} from "@/lib/partners/commission";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("splitCents", () => {
  it("always adds back to the total", () => {
    for (const total of [0, 1, 99, 100, 1001, 123457]) {
      expect(splitCents(total, [3500, 6500]).reduce((a, b) => a + b, 0)).toBe(total);
      expect(splitCents(total, [1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(total);
    }
  });
  it("splits $1,000 profit 35/65 and 80/20", () => {
    expect(splitCents(100000, [3500, 6500])).toEqual([35000, 65000]);
    expect(splitCents(35000, [8000, 2000])).toEqual([28000, 7000]);
  });
  it("gives zero shares when no weight", () => {
    expect(splitCents(500, [0, 0])).toEqual([0, 0]);
  });
});

describe("rateForMonth", () => {
  const terms = [
    { agentId: null, effectiveFrom: d("2026-01-01"), rateBps: 3500 },
    { agentId: null, effectiveFrom: d("2026-07-01"), rateBps: 4000 },
    { agentId: "a1", effectiveFrom: d("2026-01-01"), rateBps: 8000 },
  ];
  it("uses the rate in force for that month, so past months don't change", () => {
    expect(rateForMonth(terms, null, d("2026-06-01"), 1)).toBe(3500);
    expect(rateForMonth(terms, null, d("2026-07-01"), 1)).toBe(4000);
    expect(rateForMonth(terms, "a1", d("2026-09-01"), 1)).toBe(8000);
  });
  it("falls back to the default when nothing applies yet", () => {
    expect(rateForMonth(terms, null, d("2025-12-01"), 3500)).toBe(3500);
    expect(rateForMonth(terms, "a2", d("2026-09-01"), 8000)).toBe(8000);
  });
});

describe("computeMonthCommission", () => {
  it("shares $1,000: WGC 650, partner 350, of which agent 280 and partner keeps 70", () => {
    const c = computeMonthCommission({
      merchants: [{ churchId: "c1", agentId: "a1", profitCents: 100000 }],
      partnerRateBps: 3500,
      agentRateBps: () => 8000,
    });
    expect([c.wgcCents, c.partnerCents, c.agentsCents, c.partnerKeepsCents]).toEqual([65000, 35000, 28000, 7000]);
  });
  it("organizations with no agent: the partner keeps its whole share", () => {
    const c = computeMonthCommission({
      merchants: [{ churchId: "c1", agentId: null, profitCents: 100000 }],
      partnerRateBps: 3500,
      agentRateBps: () => 8000,
    });
    expect([c.agentsCents, c.partnerKeepsCents]).toEqual([0, 35000]);
  });
  it("splits by agent and the totals match the parts", () => {
    const c = computeMonthCommission({
      merchants: [
        { churchId: "c1", agentId: "a1", profitCents: 60000 },
        { churchId: "c2", agentId: "a1", profitCents: 20000 },
        { churchId: "c3", agentId: "a2", profitCents: 20000 },
      ],
      partnerRateBps: 3500,
      agentRateBps: (id) => (id === "a1" ? 8000 : 7000),
    });
    const a1 = c.lines.find((l) => l.agentId === "a1")!;
    const a2 = c.lines.find((l) => l.agentId === "a2")!;
    expect(a1.agentCents).toBe(22400); // 80% of 35% of 800.00
    expect(a2.agentCents).toBe(4900); // 70% of 35% of 200.00
    expect(c.wgcCents + c.partnerCents).toBe(c.profitCents);
    expect(c.agentsCents + c.partnerKeepsCents).toBe(c.partnerCents);
  });
  it("a negative month pays nobody", () => {
    const c = computeMonthCommission({
      merchants: [{ churchId: "c1", agentId: "a1", profitCents: -5000 }],
      partnerRateBps: 3500,
      agentRateBps: () => 8000,
    });
    expect([c.wgcCents, c.partnerCents, c.agentsCents]).toEqual([0, 0, 0]);
    expect(c.lines[0].carryOutCents).toBe(-5000);
  });
});

describe("computeCommissionRun", () => {
  const rates = { partnerRateBps: () => 3500, agentRateBps: () => 8000 };
  it("carries a bad month into the next one for the same agent", () => {
    const run = computeCommissionRun(
      [
        { month: d("2026-01-01"), merchants: [{ churchId: "c1", agentId: "a1", profitCents: -4000 }] },
        { month: d("2026-02-01"), merchants: [{ churchId: "c1", agentId: "a1", profitCents: 14000 }] },
        { month: d("2026-03-01"), merchants: [{ churchId: "c1", agentId: "a1", profitCents: 10000 }] },
      ],
      rates
    );
    expect(run[0].commission.partnerCents).toBe(0);
    expect(run[1].commission.lines[0].carryInCents).toBe(-4000);
    expect(run[1].commission.lines[0].sharedCents).toBe(10000);
    expect(run[1].commission.partnerCents).toBe(3500);
    expect(run[2].commission.lines[0].carryInCents).toBe(0);
    expect(run[2].commission.partnerCents).toBe(3500);
  });
  it("works off a shortfall even in a month with no activity", () => {
    const run = computeCommissionRun(
      [
        { month: d("2026-01-01"), merchants: [{ churchId: "c1", agentId: "a1", profitCents: -4000 }] },
        { month: d("2026-02-01"), merchants: [] },
      ],
      rates
    );
    expect(run[1].commission.lines[0].carryOutCents).toBe(-4000);
  });
});

describe("merchantProfitCents", () => {
  it("is the merchant's share of the platform profit plus adjustments", () => {
    expect(merchantProfitCents({ merchantChargedCents: 2500, platformChargedCents: 10000, platformResidualCents: 8000, adjustmentCents: -500 })).toBe(1500);
  });
  it("is just the adjustment when the platform charged nothing", () => {
    expect(merchantProfitCents({ merchantChargedCents: 0, platformChargedCents: 0, platformResidualCents: 0, adjustmentCents: -300 })).toBe(-300);
  });
  it("never claims more than the whole platform profit", () => {
    expect(merchantProfitCents({ merchantChargedCents: 999, platformChargedCents: 100, platformResidualCents: 5000, adjustmentCents: 0 })).toBe(5000);
  });
});
