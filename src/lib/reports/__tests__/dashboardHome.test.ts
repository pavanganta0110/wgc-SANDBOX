import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  finixDispute: { count: vi.fn() },
  finixTransfer: { count: vi.fn() },
  bankReturn: { count: vi.fn() },
  payment: { findMany: vi.fn() },
  eventRegistration: { findMany: vi.fn() },
  pledge: { findMany: vi.fn() },
  donor: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import {
  aggregateWindows,
  previousWindow,
  splitWindow,
  buildAttentionItems,
  getAttentionCounts,
  describeAuthRate,
  getTopDonors,
  getDonorGrowth,
  getRecentActivity,
  mergeActivity,
  timeAgo,
  initialsOf,
  ACTIVITY_LIMIT,
  type ActivityItem,
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

describe("getTopDonors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$queryRaw.mockResolvedValue([
      { donor_id: "d1", name: "alice adams", anonymous: false, amt: BigInt(9000), gifts: BigInt(3) },
      { donor_id: "d2", name: "Private Person", anonymous: true, amt: BigInt(500), gifts: BigInt(1) },
    ]);
  });

  it("counts only succeeded non-settlement transfers, scoped by the session church, with a LIMIT", async () => {
    await getTopDonors({ churchId: "church_1", dateFilter: { gte: new Date("2026-01-01") } });
    const q = mockPrisma.$queryRaw.mock.calls[0][0];
    expect(q.sql).toContain("UPPER(t.state) = 'SUCCEEDED'");
    expect(q.sql).toContain("SETTLEMENT");
    expect(q.sql).toContain("LIMIT");
    expect(q.sql).not.toContain("church_1");
    expect(q.values).toEqual(expect.arrayContaining(["church_1", 5]));
  });

  it("scopes a team member to their own attributed payments", async () => {
    await getTopDonors({ churchId: "church_1", attributedUserId: "user_2" });
    const q = mockPrisma.$queryRaw.mock.calls[0][0];
    expect(q.sql).toContain('p."attributedUserId" =');
    expect(q.values).toContain("user_2");
  });

  it("maps rows and respects a donor's anonymity preference", async () => {
    const out = await getTopDonors({ churchId: "church_1" });
    expect(out[0]).toMatchObject({ donorId: "d1", amountCents: 9000, gifts: 3 });
    expect(out[1].name).toBe("Anonymous donor");
  });

  it("returns an empty list when there are no donors (empty state)", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    expect(await getTopDonors({ churchId: "church_1" })).toEqual([]);
  });
});

describe("initialsOf", () => {
  it("uses the first letters of the first two words", () => {
    expect(initialsOf("Alice Adams")).toBe("AA");
    expect(initialsOf("madonna")).toBe("M");
    expect(initialsOf("Mary Jane Watson")).toBe("MJ");
    expect(initialsOf("  ")).toBe("?");
  });
});

describe("getDonorGrowth", () => {
  const buckets = [
    { start: new Date("2026-09-01T00:00:00Z"), end: new Date("2026-09-08T00:00:00Z"), label: "Sep 1" },
    { start: new Date("2026-09-08T00:00:00Z"), end: new Date("2026-09-15T00:00:00Z"), label: "Sep 8" },
  ];
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$queryRaw.mockResolvedValue([
      { idx: BigInt(1), new_donors: BigInt(2), returning: BigInt(1) },
      { idx: BigInt(2), new_donors: BigInt(0), returning: BigInt(3) },
    ]);
  });

  it("maps new vs returning per bucket, in order", async () => {
    expect(await getDonorGrowth({ churchId: "c", buckets })).toEqual([
      { label: "Sep 1", newDonors: 2, returningDonors: 1 },
      { label: "Sep 8", newDonors: 0, returningDonors: 3 },
    ]);
  });

  it("only counts successful payments, scoped to the church and (when set) the team user", async () => {
    await getDonorGrowth({ churchId: "church_1", attributedUserId: "user_5", buckets });
    const q = mockPrisma.$queryRaw.mock.calls[0][0];
    expect(q.sql).toContain("UPPER(t.state) = 'SUCCEEDED'");
    expect(q.sql).toContain("p.status = 'SUCCEEDED'");
    expect(q.values).toEqual(expect.arrayContaining(["church_1", "user_5"]));
  });

  it("only looks up first-gift dates for donors active in the span, not the whole table", async () => {
    await getDonorGrowth({ churchId: "c", buckets });
    expect(mockPrisma.$queryRaw.mock.calls[0][0].sql).toContain("IN (SELECT DISTINCT donor_id FROM active)");
  });

  it("fills zeros for missing rows and skips the query with no buckets", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    expect(await getDonorGrowth({ churchId: "c", buckets })).toEqual([
      { label: "Sep 1", newDonors: 0, returningDonors: 0 },
      { label: "Sep 8", newDonors: 0, returningDonors: 0 },
    ]);
    mockPrisma.$queryRaw.mockClear();
    expect(await getDonorGrowth({ churchId: "c", buckets: [] })).toEqual([]);
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });
});

describe("mergeActivity / timeAgo", () => {
  const item = (id: string, type: ActivityItem["type"], minsAgo: number): ActivityItem => ({
    id,
    type,
    name: id,
    amountCents: 100,
    at: new Date(Date.now() - minsAgo * 60000),
    href: "/x",
  });

  it("merges every source newest-first and trims to the limit", () => {
    const merged = mergeActivity([[item("a", "donation", 30)], [item("b", "registration", 5)], [item("c", "pledge", 60)]]);
    expect(merged.map((m) => m.id)).toEqual(["b", "a", "c"]);
    const many = mergeActivity([Array.from({ length: 30 }, (_, i) => item(`x${i}`, "donation", i))]);
    expect(many).toHaveLength(ACTIVITY_LIMIT);
  });

  it("formats relative time", () => {
    const now = new Date("2026-10-05T12:00:00Z");
    expect(timeAgo(new Date("2026-10-05T11:59:40Z"), now)).toBe("just now");
    expect(timeAgo(new Date("2026-10-05T11:55:00Z"), now)).toBe("5m ago");
    expect(timeAgo(new Date("2026-10-05T09:00:00Z"), now)).toBe("3h ago");
    expect(timeAgo(new Date("2026-10-03T12:00:00Z"), now)).toBe("2d ago");
    expect(timeAgo(new Date("2026-09-01T12:00:00Z"), now)).toBe("Sep 1");
    expect(timeAgo(new Date("2026-10-05T12:00:30Z"), now)).toBe("just now"); // clock skew never goes negative
  });
});

describe("getRecentActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.payment.findMany.mockResolvedValue([
      { id: "p1", donorId: "d1", amountCents: 2500, createdAt: new Date("2026-10-05T10:00:00Z"), isAnonymous: false, fundName: "General", finixTransferId: "t1" },
      { id: "p2", donorId: null, amountCents: 900, createdAt: new Date("2026-10-05T09:00:00Z"), isAnonymous: false, fundName: null, finixTransferId: null },
      { id: "p3", donorId: "d1", amountCents: 100, createdAt: new Date("2026-10-04T09:00:00Z"), isAnonymous: true, fundName: null, finixTransferId: "t3" },
    ]);
    mockPrisma.eventRegistration.findMany.mockResolvedValue([
      { id: "r1", eventId: "e1", registrantFirstName: "Amy", registrantLastName: "Buyer", totalCents: 0, attendeeCount: 1, confirmedAt: new Date("2026-10-05T11:00:00Z"), createdAt: new Date("2026-10-05T11:00:00Z") },
    ]);
    mockPrisma.pledge.findMany.mockResolvedValue([
      { id: "pl1", pledgeCampaignId: "pc1", donorId: "d1", isAnonymous: false, pledgeAmountCents: 50000, pledgedAt: new Date("2026-10-03T09:00:00Z") },
    ]);
    mockPrisma.donor.findMany.mockResolvedValue([{ id: "d1", name: "alice adams", anonymousPreference: false }]);
  });

  it("merges donations, registrations and pledges newest-first with correct names and links", async () => {
    const out = await getRecentActivity({ churchId: "church_1", paymentScope: { churchId: "church_1" }, includeRegistrations: true });
    expect(out.map((i) => i.id)).toEqual(["registration:r1", "payment:p1", "payment:p2", "payment:p3", "pledge:pl1"]);
    expect(out.find((i) => i.id === "payment:p2")!.name).toBe("Guest donor");
    expect(out.find((i) => i.id === "payment:p3")!.name).toBe("Anonymous donor");
    expect(out.find((i) => i.id === "registration:r1")!.amountCents).toBeNull(); // free registration
    expect(out.find((i) => i.id === "payment:p1")!.href).toContain("id=t1");
  });

  it("only reads successful payments inside the supplied scope, and the session church for everything else", async () => {
    await getRecentActivity({ churchId: "church_1", paymentScope: { churchId: "church_1", attributedUserId: "user_1" }, includeRegistrations: true });
    const where = mockPrisma.payment.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ churchId: "church_1", attributedUserId: "user_1", status: "SUCCEEDED" });
    expect(mockPrisma.eventRegistration.findMany.mock.calls[0][0].where.churchId).toBe("church_1");
    expect(mockPrisma.pledge.findMany.mock.calls[0][0].where.churchId).toBe("church_1");
    expect(mockPrisma.donor.findMany.mock.calls[0][0].where.churchId).toBe("church_1");
  });

  it("omits registrations and filters pledges for a team view", async () => {
    await getRecentActivity({ churchId: "c", paymentScope: { churchId: "c" }, includeRegistrations: false, attributedUserId: "user_9" });
    expect(mockPrisma.eventRegistration.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.pledge.findMany.mock.calls[0][0].where.attributedUserId).toBe("user_9");
  });

  it("returns an empty list for a brand-new account", async () => {
    mockPrisma.payment.findMany.mockResolvedValue([]);
    mockPrisma.eventRegistration.findMany.mockResolvedValue([]);
    mockPrisma.pledge.findMany.mockResolvedValue([]);
    expect(await getRecentActivity({ churchId: "c", paymentScope: { churchId: "c" }, includeRegistrations: true })).toEqual([]);
    expect(mockPrisma.donor.findMany).not.toHaveBeenCalled();
  });
});
