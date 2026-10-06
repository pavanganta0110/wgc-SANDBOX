import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  finixDispute: { count: vi.fn() },
  finixTransfer: { count: vi.fn() },
  bankReturn: { count: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import {
  aggregateWindows,
  previousWindow,
  splitWindow,
  buildAttentionItems,
  getAttentionCounts,
  describeAuthRate,
} from "@/lib/reports/dashboardHome";

describe("previousWindow / splitWindow", () => {
  it("previous window is the equal-length span right before the range", () => {
    const start = new Date("2026-04-01T00:00:00Z");
    const end = new Date("2026-10-01T00:00:00Z");
    const prev = previousWindow(start, end);
    expect(prev.end.getTime()).toBe(start.getTime());
    expect(end.getTime() - start.getTime()).toBe(prev.end.getTime() - prev.start.getTime());
  });

  it("splits a range into contiguous, gap-free, equal buckets that cover it exactly", () => {
    const start = new Date("2026-01-01T00:00:00Z");
    const end = new Date("2026-01-13T00:00:00Z");
    const parts = splitWindow(start, end, 12);
    expect(parts).toHaveLength(12);
    expect(parts[0].start.getTime()).toBe(start.getTime());
    expect(parts[11].end.getTime()).toBe(end.getTime());
    for (let i = 1; i < parts.length; i++) expect(parts[i].start.getTime()).toBe(parts[i - 1].end.getTime());
  });

  it("returns nothing for an empty or inverted range", () => {
    const t = new Date("2026-01-01T00:00:00Z");
    expect(splitWindow(t, t, 12)).toEqual([]);
    expect(splitWindow(new Date(t.getTime() + 1000), t, 12)).toEqual([]);
  });
});

describe("buildAttentionItems", () => {
  it("hides everything when nothing needs attention (empty state)", () => {
    expect(buildAttentionItems({ disputes: 0, failedPayments: 0, failedRefunds: 0, achReturns: 0 })).toEqual([]);
  });

  it("only includes non-zero counts, pluralised, with links", () => {
    const items = buildAttentionItems({ disputes: 1, failedPayments: 3, failedRefunds: 0, achReturns: 2 });
    expect(items.map((i) => i.label)).toEqual(["1 open dispute", "3 failed payments", "2 ACH returns"]);
    expect(items.every((i) => i.href.startsWith("/merchant/"))).toBe(true);
  });
});

describe("getAttentionCounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.finixDispute.count.mockResolvedValue(2);
    mockPrisma.finixTransfer.count.mockResolvedValue(5);
    mockPrisma.bankReturn.count.mockResolvedValue(1);
  });

  it("scopes everything by church and uses the dashboard's own failed-refund figure", async () => {
    const counts = await getAttentionCounts({
      churchId: "church_1",
      dateFilter: { gte: new Date("2026-01-01") },
      transferScope: { churchId: "church_1" },
      failedRefundCount: 4,
    });
    expect(counts).toEqual({ disputes: 2, failedPayments: 5, failedRefunds: 4, achReturns: 1 });
    expect(mockPrisma.finixDispute.count.mock.calls[0][0].where.churchId).toBe("church_1");
    expect(mockPrisma.bankReturn.count.mock.calls[0][0].where.churchId).toBe("church_1");
    expect(mockPrisma.finixTransfer.count.mock.calls[0][0].where.state).toEqual({ equals: "FAILED", mode: "insensitive" });
  });

  it("bridges bank returns through the team user's own transfers", async () => {
    await getAttentionCounts({
      churchId: "church_1",
      transferScope: { churchId: "church_1", finixTransferId: { in: ["t1"] } },
      failedRefundCount: 0,
      scopedTransferIds: ["t1"],
    });
    expect(mockPrisma.bankReturn.count.mock.calls[0][0].where.originalTransferId).toEqual({ in: ["t1"] });
  });
});

describe("aggregateWindows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$queryRaw.mockResolvedValue([
      { idx: BigInt(1), vol: BigInt(1500), cnt: BigInt(3) },
      { idx: BigInt(2), vol: BigInt(0), cnt: BigInt(0) },
    ]);
  });

  const windows = [
    { start: new Date("2026-01-01T00:00:00Z"), end: new Date("2026-01-08T00:00:00Z") },
    { start: new Date("2026-01-08T00:00:00Z"), end: new Date("2026-01-15T00:00:00Z") },
  ];

  it("returns one aggregate per window, in order, and counts empty windows as zero", async () => {
    const out = await aggregateWindows({ churchId: "church_1", windows });
    expect(out).toEqual([
      { volumeCents: 1500, count: 3 },
      { volumeCents: 0, count: 0 },
    ]);
  });

  it("counts only succeeded, non-settlement transfers for the session church (bound, not interpolated)", async () => {
    await aggregateWindows({ churchId: "church_1", windows });
    const q = mockPrisma.$queryRaw.mock.calls[0][0];
    expect(q.sql).toContain("UPPER(t.state) = 'SUCCEEDED'");
    expect(q.sql).toContain("SETTLEMENT");
    expect(q.sql).not.toContain("church_1");
    expect(q.values).toContain("church_1");
    expect(q.sql).not.toContain('p."attributedUserId" =');
  });

  it("scopes a team member to their own attributed payments", async () => {
    await aggregateWindows({ churchId: "church_1", attributedUserId: "user_8", windows });
    const q = mockPrisma.$queryRaw.mock.calls[0][0];
    expect(q.sql).toContain('p."attributedUserId" =');
    expect(q.values).toContain("user_8");
  });

  it("skips the query for no windows", async () => {
    expect(await aggregateWindows({ churchId: "c", windows: [] })).toEqual([]);
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });
});

describe("describeAuthRate", () => {
  it("is an honest empty state with no attempts", () => {
    expect(describeAuthRate(0, 0)).toMatchObject({ status: "none", ratePercent: null });
  });

  it("maps the rate to a status with plain-language copy", () => {
    expect(describeAuthRate(90, 100)).toMatchObject({ status: "good", headline: "Healthy" });
    expect(describeAuthRate(75, 100)).toMatchObject({ status: "warning", headline: "Worth a look" });
    expect(describeAuthRate(50, 100)).toMatchObject({ status: "critical", headline: "Needs attention" });
    expect(describeAuthRate(35, 40).caption).toBe("35 of 40 payment attempts were approved.");
  });

  it("treats the thresholds as inclusive on the good side", () => {
    expect(describeAuthRate(85, 100).status).toBe("good");
    expect(describeAuthRate(70, 100).status).toBe("warning");
  });
});
