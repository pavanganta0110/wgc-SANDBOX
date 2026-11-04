import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  church: { findMany: vi.fn() },
  partnerAgent: { findMany: vi.fn() },
  finixRefundOrReversal: { aggregate: vi.fn() },
  bankReturn: { aggregate: vi.fn() },
  $queryRaw: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { loadPartnerVolume, parseVolumePeriod, TRANSACTION_LIMIT } from "../loadPartnerVolume";

const from = new Date("2026-02-01T00:00:00Z");
const to = new Date("2026-03-01T00:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  db.church.findMany.mockResolvedValue([
    { id: "c1", name: "Alpha", status: "ACTIVE", partnerAgentId: "a1", createdAt: new Date("2025-10-01T00:00:00Z") },
    { id: "c2", name: "Beta", status: "ACTIVE", partnerAgentId: null, createdAt: new Date("2026-01-01T00:00:00Z") },
  ]);
  db.partnerAgent.findMany.mockResolvedValue([{ id: "a1", name: "Ann" }]);
  db.finixRefundOrReversal.aggregate.mockResolvedValue({ _sum: { amountCents: 500 } });
  db.bankReturn.aggregate.mockResolvedValue({ _sum: { amountCents: 200 } });
  db.$queryRaw
    .mockResolvedValueOnce([
      { church_id: "c1", method: "CARD", amount: BigInt(10000), count: BigInt(4) },
      { church_id: "c1", method: "ACH", amount: BigInt(5000), count: BigInt(1) },
      { church_id: "c2", method: "CARD", amount: BigInt(2000), count: BigInt(2) },
    ])
    .mockResolvedValueOnce([{ id: "t1", created: new Date("2026-02-10T12:00:00Z"), church_id: "c1", method: "CARD", amount: BigInt(2500) }]);
});

describe("loadPartnerVolume", () => {
  it("splits card and ACH, nets refunds and returns, and names the agent per client", async () => {
    const v = await loadPartnerVolume({ partnerId: "p1", from, to });
    expect(v.card).toEqual({ amountCents: 12000, count: 6 });
    expect(v.ach).toEqual({ amountCents: 5000, count: 1 });
    expect(v.total).toEqual({ amountCents: 17000, count: 7 });
    expect(v.netCents).toBe(17000 - 500 - 200);
    expect(v.clients.map((c) => [c.name, c.agentName, c.totalCents])).toEqual([["Alpha", "Ann", 15000], ["Beta", null, 2000]]);
    expect(v.transactions[0]).toMatchObject({ clientName: "Alpha", agentName: "Ann", method: "CARD", amountCents: 2500 });
  });

  it("an agent's query is limited to their own clients in the database lookup", async () => {
    await loadPartnerVolume({ partnerId: "p1", agentId: "a1", from, to });
    expect(db.church.findMany.mock.calls[0]![0].where).toEqual({ partnerId: "p1", partnerAgentId: "a1" });
  });

  it("a partner with no clients gets empty figures and no money queries", async () => {
    db.church.findMany.mockResolvedValue([]);
    const v = await loadPartnerVolume({ partnerId: "p1", from, to });
    expect(v.total.amountCents).toBe(0);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it("flags a truncated transaction list", async () => {
    db.$queryRaw.mockReset();
    db.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(Array.from({ length: TRANSACTION_LIMIT + 1 }, (_, i) => ({ id: `t${i}`, created: new Date(), church_id: "c1", method: "CARD", amount: BigInt(100) })));
    const v = await loadPartnerVolume({ partnerId: "p1", from, to });
    expect(v.transactionsTruncated).toBe(true);
    expect(v.transactions).toHaveLength(TRANSACTION_LIMIT);
  });

  it("exposes nothing about WGC's fees, costs or revenue, or payer details", async () => {
    const v = await loadPartnerVolume({ partnerId: "p1", from, to });
    const text = JSON.stringify(v).toLowerCase();
    for (const word of ["residual", "wgc", "fee", "payer", "email", "donor"]) expect(text).not.toContain(word);
  });
});

describe("parseVolumePeriod", () => {
  const now = new Date("2026-03-15T00:00:00Z");
  it("reads a month, all time, or falls back to the current month", () => {
    expect(parseVolumePeriod("2026-02", now)).toMatchObject({ key: "2026-02", from: from, to: to });
    expect(parseVolumePeriod("all", now).key).toBe("all");
    expect(parseVolumePeriod("junk", now).key).toBe("2026-03");
    expect(parseVolumePeriod(undefined, now).key).toBe("2026-03");
  });
});
