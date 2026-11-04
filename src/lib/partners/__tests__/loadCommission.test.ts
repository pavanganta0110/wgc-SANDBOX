import { describe, it, expect, vi, beforeEach } from "vitest";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const db = vi.hoisted(() => ({
  partner: { findUnique: vi.fn() },
  partnerAgent: { findMany: vi.fn() },
  partnerRateTerm: { findMany: vi.fn() },
  church: { findMany: vi.fn() },
  partnerCommissionStatement: { findMany: vi.fn() },
  partnerCommissionPayout: { findMany: vi.fn() },
  partnerProfitAdjustment: { findMany: vi.fn() },
  partnerUser: { findMany: vi.fn() },
  $queryRaw: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
const ledger = vi.hoisted(() => ({ loadResidualLedger: vi.fn() }));
vi.mock("@/lib/admin/residuals", () => ledger);

import { loadCommission } from "../loadCommission";

const NOW = d("2026-03-15");
beforeEach(() => {
  vi.clearAllMocks();
  db.partner.findUnique.mockResolvedValue({ id: "p1", name: "Sparrow" });
  db.partnerAgent.findMany.mockResolvedValue([
    { id: "a1", name: "Ann", email: "ann@x.test", status: "ACTIVE" },
    { id: "a2", name: "Bob", email: "bob@x.test", status: "ACTIVE" },
  ]);
  db.partnerRateTerm.findMany.mockResolvedValue([]);
  db.church.findMany.mockResolvedValue([
    { id: "c1", name: "Alpha", partnerAgentId: "a1" },
    { id: "c2", name: "Beta", partnerAgentId: "a2" },
  ]);
  db.partnerCommissionStatement.findMany.mockResolvedValue([]);
  db.partnerCommissionPayout.findMany.mockResolvedValue([]);
  db.partnerProfitAdjustment.findMany.mockResolvedValue([]);
  db.partnerUser.findMany.mockResolvedValue([]);
  // February: c1 charged $60 of fees, c2 $40, of $100 platform-wide; the processor statement residual is $1,000.
  db.$queryRaw.mockResolvedValue([
    { church_id: "c1", month: d("2026-02-01"), charged: 6000 },
    { church_id: "c2", month: d("2026-02-01"), charged: 4000 },
  ]);
  ledger.loadResidualLedger.mockResolvedValue({
    months: [{ month: "2026-02-01T00:00:00.000Z", wgcChargedCents: 10000, statement: { state: "APPROVED", totalResidualCents: 100000 } }],
  });
});

describe("loadCommission shows each audience only its own part", () => {
  it("admin sees everything, including WGC's share", async () => {
    const v = (await loadCommission("p1", { kind: "admin" }, NOW))!;
    const feb = v.months.find((m) => m.label === "Feb 2026")!;
    expect(feb).toMatchObject({ status: "ESTIMATE", profitCents: 100000, wgcCents: 65000, partnerCents: 35000, agentsCents: 28000, partnerKeepsCents: 7000 });
  });

  it("the partner sees its 35% and the agent/partner split, never WGC's share or the total profit", async () => {
    const v = (await loadCommission("p1", { kind: "partner" }, NOW))!;
    const feb = v.months.find((m) => m.label === "Feb 2026")!;
    expect(feb).toMatchObject({ partnerCents: 35000, agentsCents: 28000, partnerKeepsCents: 7000, yourCents: 35000 });
    expect(feb.profitCents).toBeNull();
    expect(feb.wgcCents).toBeNull();
    expect(feb.lines.every((l) => l.profitCents === null)).toBe(true);
    expect(JSON.stringify(v)).not.toContain("65000");
    expect(JSON.stringify(v)).not.toContain("100000");
  });

  it("an agent sees only their own amount and organizations", async () => {
    const v = (await loadCommission("p1", { kind: "agent", agentId: "a1" }, NOW))!;
    const feb = v.months.find((m) => m.label === "Feb 2026")!;
    // Ann's organization earned 60% of $1,000; the partner's 35% of that is $210; Ann's 80% is $168.
    expect(feb.yourCents).toBe(16800);
    expect(feb.partnerCents).toBeNull();
    expect(feb.agentsCents).toBeNull();
    expect(feb.partnerKeepsCents).toBeNull();
    expect(feb.wgcCents).toBeNull();
    expect(feb.profitCents).toBeNull();
    expect(feb.lines).toHaveLength(1);
    expect(feb.lines[0]).toMatchObject({ agentId: "a1", agentCents: 16800, partnerCents: null, partnerKeepsCents: null });
    expect(v.organizations.map((o) => o.name)).toEqual(["Alpha"]);
    expect(v.allOrganizations).toEqual([]);
    expect(v.agents.map((a) => a.name)).toEqual(["Ann"]);
    expect(v.agents[0]!.email).toBeNull();
  });

  it("a month without an approved statement shows nothing as earned", async () => {
    ledger.loadResidualLedger.mockResolvedValue({ months: [] });
    const v = (await loadCommission("p1", { kind: "partner" }, NOW))!;
    const feb = v.months.find((m) => m.label === "Feb 2026")!;
    expect(feb.status).toBe("AWAITING_STATEMENT");
    expect(feb.partnerCents).toBeNull();
    expect(v.totals.estimateCents).toBe(0);
  });

  it("a finalized month is read from its frozen statement, not recalculated", async () => {
    db.partnerCommissionStatement.findMany.mockResolvedValue([
      {
        month: d("2026-02-01"),
        linesJson: {
          partnerRateBps: 3000, profitCents: 1000, wgcCents: 700, partnerCents: 300, agentsCents: 240, partnerKeepsCents: 60,
          lines: [{ agentId: "a1", profitCents: 1000, carryInCents: 0, sharedCents: 1000, carryOutCents: 0, wgcCents: 700, partnerCents: 300, agentCents: 240, partnerKeepsCents: 60, agentRateBps: 8000 }],
        },
      },
    ]);
    const v = (await loadCommission("p1", { kind: "partner" }, NOW))!;
    const feb = v.months.find((m) => m.label === "Feb 2026")!;
    expect(feb).toMatchObject({ status: "FINAL", partnerCents: 300 });
    expect(v.totals.finalCents).toBe(300);
    expect(v.totals.owedCents).toBe(300);
  });

  it("only final months count as owed, and payments reduce it", async () => {
    db.partnerCommissionStatement.findMany.mockResolvedValue([
      { month: d("2026-02-01"), linesJson: { partnerRateBps: 3500, profitCents: 1000, wgcCents: 650, partnerCents: 350, agentsCents: 0, partnerKeepsCents: 350, lines: [{ agentId: null, profitCents: 1000, carryInCents: 0, sharedCents: 1000, carryOutCents: 0, wgcCents: 650, partnerCents: 350, agentCents: 0, partnerKeepsCents: 350, agentRateBps: 0 }] } },
    ]);
    db.partnerCommissionPayout.findMany.mockResolvedValue([{ id: "x", agentId: null, month: d("2026-02-01"), amountCents: 100, paidAt: d("2026-03-10"), method: "ACH", note: null }]);
    const v = (await loadCommission("p1", { kind: "partner" }, NOW))!;
    expect(v.totals).toMatchObject({ finalCents: 350, paidCents: 100, owedCents: 250 });
  });
});
