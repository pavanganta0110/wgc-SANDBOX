import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { agentsCsv, clientsCsv, commissionCsv, summarizeAgents, NO_AGENT, type ClientReportRow } from "../partnerReportsCsv";
import type { CommissionView } from "../loadCommission";

const from = new Date("2026-11-01T00:00:00Z");
const to = new Date("2026-12-01T00:00:00Z");
const row = (o: Partial<ClientReportRow>): ClientReportRow => ({
  churchId: "c1", name: "Grace", status: "ACTIVE", agentId: "a1", agentName: "Amy", joinedAt: "2026-11-03T00:00:00.000Z",
  card: { amountCents: 10000, count: 2 }, ach: { amountCents: 5000, count: 1 }, totalCents: 15000, paymentCount: 3,
  refundsCents: 1000, refundsCount: 1, returnsCents: 500, returnsCount: 1, ...o,
});

describe("partner CSV reports", () => {
  const rows = [
    row({}),
    row({ churchId: "c2", name: "Hope", joinedAt: "2026-01-01T00:00:00.000Z", card: { amountCents: 20000, count: 1 }, totalCents: 25000, refundsCents: 0, returnsCents: 0 }),
    row({ churchId: "c3", name: "Orphan", agentId: null, agentName: null, status: "TERMINATED", totalCents: 100, card: { amountCents: 100, count: 1 }, ach: { amountCents: 0, count: 0 } }),
  ];

  it("lists clients by agent with refunds, returns and net", () => {
    const lines = clientsCsv(rows, from, to).split("\n");
    expect(lines[0]).toBe("Agent,Client,Status,Joined,Joined in period,Card volume (USD),Card payments,ACH volume (USD),ACH payments,Total volume (USD),Refunds (USD),Refund count,ACH returns (USD),ACH return count,Net volume (USD)");
    expect(lines[1]).toBe("Amy,Grace,Active,2026-11-03,Yes,100.00,2,50.00,1,150.00,10.00,1,5.00,1,135.00");
    expect(lines[3]).toContain(`${NO_AGENT},Orphan,Terminated`);
  });

  it("summarizes per agent, no-agent last", () => {
    const s = summarizeAgents(rows, from, to);
    expect(s.map((a) => a.agentName)).toEqual(["Amy", NO_AGENT]);
    expect(s[0]).toMatchObject({ clients: 2, joinedInPeriod: 1, totalCents: 40000, cardCents: 30000 });
    expect(agentsCsv(s).split("\n")[1]).toBe("Amy,2,2,1,300.00,3,100.00,2,400.00,10.00,5.00,385.00");
  });

  it("neutralizes formulas in client names", () => {
    expect(clientsCsv([row({ name: "=1+1" })], from, to)).toContain("'=1+1");
  });

  it("commission csv hides partner columns for an agent", () => {
    const month = { month: "2026-10-01", label: "Oct 2026", status: "FINAL", lines: [{ agentId: "a1", agentName: "Amy", agentCents: 1234, carryInCents: 0, agentRateBps: 8000, partnerCents: null, partnerKeepsCents: null, profitCents: null }] };
    const agentView = { viewer: "agent", months: [month] } as unknown as CommissionView;
    expect(commissionCsv(agentView)).toBe("Month,Status,Agent,Agent rate (%),Carried in (USD),Agent commission (USD)\nOct 2026,Final,Amy,80.00,0.00,12.34");
    const partnerView = { viewer: "partner", months: [{ ...month, lines: [{ ...month.lines[0], partnerCents: 1543, partnerKeepsCents: 309 }] }] } as unknown as CommissionView;
    expect(commissionCsv(partnerView).split("\n")[1]).toBe("Oct 2026,Final,Amy,80.00,0.00,12.34,15.43,3.09");
  });
});
