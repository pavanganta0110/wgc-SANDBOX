import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  givingLink: { findMany: vi.fn(), groupBy: vi.fn() },
  event: { findMany: vi.fn() },
  fundraisingCampaign: { findMany: vi.fn() },
  campaignTeam: { findMany: vi.fn() },
  campaignFundraiser: { findMany: vi.fn() },
  pledgeCampaign: { findMany: vi.fn() },
  eventRegistration: { groupBy: vi.fn(), findMany: vi.fn() },
  eventAttendee: { findMany: vi.fn() },
  pledge: { groupBy: vi.fn() },
  externalDonation: { groupBy: vi.fn() },
  $queryRaw: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import {
  buildLinkAssignments,
  buildSourceGroupsQuery,
  buildSourceTransactionsQuery,
  TRANSACTIONS_PER_ROW,
  type SourceTransaction,
  type EventAttendeeInfo,
  fetchEventAttendees,
  assembleWhereMoneyCameFrom,
  getWhereMoneyCameFrom,
  type SourceGroupRow,
  type EntityCatalogs,
} from "@/lib/reports/moneySources";
import { getCampaignsRaisedCentsBatch } from "@/lib/campaigns/campaignTotals";

const emptyCatalogs = (over: Partial<EntityCatalogs> = {}): EntityCatalogs => ({
  givingLinks: [],
  events: [],
  campaigns: [],
  pledgeCampaigns: [],
  campaignLifetimeRaised: new Map(),
  offlineByEvent: new Map(),
  pledgeStats: new Map(),
  ...over,
});

const group = (over: Partial<SourceGroupRow>): SourceGroupRow => ({
  kind: "PAGE",
  entityId: null,
  amountCents: 0,
  payments: 0,
  donors: 0,
  registrations: 0,
  attendees: 0,
  rollup: false,
  ...over,
});

describe("buildLinkAssignments — no double counting", () => {
  it("assigns a plain giving link to PAGE", () => {
    const m = buildLinkAssignments({
      links: [{ id: "L1", fundraisingCampaignId: null }],
      events: [], campaigns: [], teams: [], fundraisers: [], pledgeCampaigns: [],
    });
    expect(m.get("L1")).toEqual({ kind: "PAGE", entityId: "L1" });
  });

  it("keeps event, campaign, team, fundraiser and pledge links out of PAGE", () => {
    const m = buildLinkAssignments({
      links: [
        { id: "EV", fundraisingCampaignId: null },
        { id: "CA", fundraisingCampaignId: "C1" },
        { id: "TE", fundraisingCampaignId: "C1" },
        { id: "FU", fundraisingCampaignId: "C1" },
        { id: "PL", fundraisingCampaignId: null },
      ],
      events: [{ id: "E1", givingLinkId: "EV" }],
      campaigns: [{ id: "C1", givingLinkId: "CA" }],
      teams: [{ fundraisingCampaignId: "C1", givingLinkId: "TE" }],
      fundraisers: [{ fundraisingCampaignId: "C1", givingLinkId: "FU" }],
      pledgeCampaigns: [{ id: "P1", givingLinkId: "PL" }],
    });
    expect(m.get("EV")).toEqual({ kind: "EVENT", entityId: "E1" });
    expect(m.get("CA")).toEqual({ kind: "CAMPAIGN", entityId: "C1" });
    expect(m.get("TE")).toEqual({ kind: "CAMPAIGN", entityId: "C1" });
    expect(m.get("FU")).toEqual({ kind: "CAMPAIGN", entityId: "C1" });
    expect(m.get("PL")).toEqual({ kind: "PLEDGE", entityId: "P1" });
    expect(Array.from(m.values()).filter((a) => a.kind === "PAGE")).toHaveLength(0);
  });

  it("a link tagged to several things resolves to exactly one section (event wins)", () => {
    const m = buildLinkAssignments({
      links: [{ id: "X", fundraisingCampaignId: "C1" }],
      events: [{ id: "E1", givingLinkId: "X" }],
      campaigns: [{ id: "C1", givingLinkId: "X" }],
      teams: [], fundraisers: [],
      pledgeCampaigns: [{ id: "P1", givingLinkId: "X" }],
    });
    expect(m.size).toBe(1);
    expect(m.get("X")).toEqual({ kind: "EVENT", entityId: "E1" });
  });
});

describe("buildSourceGroupsQuery", () => {
  const sqlOf = (q: ReturnType<typeof buildSourceGroupsQuery>) => q.sql;

  it("counts only SUCCEEDED transfers and excludes settlements (same base as the summary)", () => {
    const q = buildSourceGroupsQuery({ churchId: "church_1", linkAssignments: new Map() });
    expect(sqlOf(q)).toContain("UPPER(t.state) = 'SUCCEEDED'");
    expect(sqlOf(q)).toContain("SETTLEMENT");
    expect(q.values).toContain("church_1");
  });

  it("applies the date range as bound parameters", () => {
    const gte = new Date("2026-01-01T00:00:00Z");
    const lte = new Date("2026-02-01T00:00:00Z");
    const q = buildSourceGroupsQuery({ churchId: "c", dateFilter: { gte, lte }, linkAssignments: new Map() });
    expect(sqlOf(q)).toContain('t."createdAtFinix" >=');
    expect(sqlOf(q)).toContain('t."createdAtFinix" <=');
    expect(q.values).toEqual(expect.arrayContaining([gte, lte]));
  });

  it("omits date and scope clauses for an organization-wide, all-time view", () => {
    const q = buildSourceGroupsQuery({ churchId: "c", linkAssignments: new Map() });
    expect(sqlOf(q)).not.toContain('t."createdAtFinix" >=');
    expect(sqlOf(q)).not.toContain('p."attributedUserId" =');
  });

  it("scopes a team member / fundraiser to their own attributed payments", () => {
    const q = buildSourceGroupsQuery({ churchId: "c", attributedUserId: "user_9", linkAssignments: new Map() });
    expect(sqlOf(q)).toContain('p."attributedUserId" =');
    expect(q.values).toContain("user_9");
  });

  it("never interpolates ids into the SQL text (all bound)", () => {
    const q = buildSourceGroupsQuery({
      churchId: "church_X",
      attributedUserId: "user_X",
      linkAssignments: new Map([["link_X", { kind: "PAGE", entityId: "link_X" }]]),
    });
    expect(sqlOf(q)).not.toContain("church_X");
    expect(sqlOf(q)).not.toContain("user_X");
    expect(sqlOf(q)).not.toContain("link_X");
  });
});

describe("assembleWhereMoneyCameFrom", () => {
  const catalogs = emptyCatalogs({
    givingLinks: [{ id: "L1", internalName: "General", publicTitle: "Give Online" }],
    events: [{ id: "E1", name: "Gala" }, { id: "E2", name: "Offline Only Fair" }],
    campaigns: [{ id: "C1", name: "Building", goalAmountCents: 100_000 }],
    pledgeCampaigns: [{ id: "P1", name: "Capital Pledge" }],
    campaignLifetimeRaised: new Map([["C1", 25_000]]),
    offlineByEvent: new Map([
      ["E1", { cents: 7_000, registrations: 2 }],
      ["E2", { cents: 3_000, registrations: 1 }],
    ]),
    pledgeStats: new Map([["P1", { pledgedCents: 50_000, fulfilledCents: 20_000, pledgers: 4, payers: 2 }]]),
  });

  const groups: SourceGroupRow[] = [
    group({ kind: "PAGE", entityId: "L1", amountCents: 10_000, payments: 4, donors: 3 }),
    group({ kind: "PAGE", entityId: null, rollup: true, amountCents: 10_000, payments: 4, donors: 3 }),
    group({ kind: "EVENT", entityId: "E1", amountCents: 30_000, payments: 6, donors: 5, registrations: 6, attendees: 9 }),
    group({ kind: "EVENT", entityId: null, rollup: true, amountCents: 30_000, payments: 6, donors: 5 }),
    group({ kind: "CAMPAIGN", entityId: "C1", amountCents: 8_000, payments: 2, donors: 2 }),
    group({ kind: "CAMPAIGN", entityId: null, rollup: true, amountCents: 8_000, payments: 2, donors: 2 }),
    group({ kind: "PLEDGE", entityId: "P1", amountCents: 5_000, payments: 1, donors: 1 }),
    group({ kind: "PLEDGE", entityId: null, rollup: true, amountCents: 5_000, payments: 1, donors: 1 }),
    group({ kind: "OTHER", entityId: null, amountCents: 1_500, payments: 3, donors: 0 }),
    group({ kind: "OTHER", entityId: null, rollup: true, amountCents: 1_500, payments: 3, donors: 0 }),
  ];

  it("reconciles: sections + unattributed equal the summary total", () => {
    const r = assembleWhereMoneyCameFrom(groups, catalogs);
    const summaryTotal = groups.filter((g) => !g.rollup).reduce((s, g) => s + g.amountCents, 0);
    expect(r.totalCents).toBe(summaryTotal);
    expect(r.givingPages.totalCents + r.events.totalCents + r.campaigns.totalCents + r.pledges.totalCents + r.other.totalCents).toBe(summaryTotal);
    expect(r.other).toEqual({ totalCents: 1_500, payments: 3, transactions: [] });
  });

  it("does not double count: rollup rows never add to totals", () => {
    const r = assembleWhereMoneyCameFrom(groups, catalogs);
    expect(r.givingPages.totalCents).toBe(10_000);
    expect(r.givingPages.rows).toHaveLength(1);
  });

  it("uses the SQL rollup for distinct section donors", () => {
    const r = assembleWhereMoneyCameFrom(groups, catalogs);
    expect(r.events.donors).toBe(5);
    expect(r.givingPages.rows[0].averageGiftCents).toBe(2_500);
  });

  it("keeps door cash/check separate from processed volume", () => {
    const r = assembleWhereMoneyCameFrom(groups, catalogs);
    expect(r.events.offlineCents).toBe(10_000);
    expect(r.events.totalCents).toBe(30_000);
    expect(r.totalCents).toBe(54_500);
    const gala = r.events.rows.find((e) => e.id === "E1")!;
    expect(gala.offlineCents).toBe(7_000);
    expect(gala.registrations).toBe(6);
    expect(gala.attendees).toBe(9);
  });

  it("lists an offline-only event with zero processed revenue", () => {
    const r = assembleWhereMoneyCameFrom(groups, catalogs);
    const fair = r.events.rows.find((e) => e.id === "E2")!;
    expect(fair.amountCents).toBe(0);
    expect(fair.offlineCents).toBe(3_000);
  });

  it("reports campaign goal progress from lifetime totals, not the range", () => {
    const r = assembleWhereMoneyCameFrom(groups, catalogs);
    expect(r.campaigns.rows[0].amountCents).toBe(8_000);
    expect(r.campaigns.rows[0].lifetimeRaisedCents).toBe(25_000);
    expect(r.campaigns.rows[0].percentOfGoal).toBe(25);
  });

  it("computes pledge fulfilment", () => {
    const r = assembleWhereMoneyCameFrom(groups, catalogs);
    const p = r.pledges.rows[0];
    expect(p.pledgedCents).toBe(50_000);
    expect(p.payersCount).toBe(2);
    expect(p.fulfilledPercent).toBe(40);
  });

  it("sorts rows by amount and computes bar shares that sum to 100", () => {
    const r = assembleWhereMoneyCameFrom(
      [
        group({ kind: "PAGE", entityId: "L1", amountCents: 1_000, payments: 1, donors: 1 }),
        group({ kind: "PAGE", entityId: "L2", amountCents: 3_000, payments: 1, donors: 1 }),
      ],
      emptyCatalogs({
        givingLinks: [
          { id: "L1", internalName: "a", publicTitle: "A" },
          { id: "L2", internalName: "b", publicTitle: "B" },
        ],
      })
    );
    expect(r.givingPages.rows.map((x) => x.id)).toEqual(["L2", "L1"]);
    expect(r.givingPages.rows.reduce((s, x) => s + x.sharePercent, 0)).toBeCloseTo(100);
  });

  it("folds money tied to an unknown entity into other instead of dropping it", () => {
    const r = assembleWhereMoneyCameFrom(
      [group({ kind: "EVENT", entityId: "GONE", amountCents: 900, payments: 1, donors: 1 })],
      emptyCatalogs()
    );
    expect(r.events.rows).toHaveLength(0);
    expect(r.other.totalCents).toBe(900);
    expect(r.totalCents).toBe(900);
  });

  it("handles no data at all (empty states)", () => {
    const r = assembleWhereMoneyCameFrom([], emptyCatalogs());
    expect(r.totalCents).toBe(0);
    for (const s of [r.givingPages, r.events, r.campaigns, r.pledges]) {
      expect(s.rows).toEqual([]);
      expect(s.totalCents).toBe(0);
      expect(s.donors).toBe(0);
    }
  });
});

describe("getWhereMoneyCameFrom", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.givingLink.findMany.mockResolvedValue([{ id: "L1", internalName: "x", publicTitle: "X", fundraisingCampaignId: null }]);
    mockPrisma.event.findMany.mockResolvedValue([]);
    mockPrisma.fundraisingCampaign.findMany.mockResolvedValue([]);
    mockPrisma.campaignTeam.findMany.mockResolvedValue([]);
    mockPrisma.campaignFundraiser.findMany.mockResolvedValue([]);
    mockPrisma.pledgeCampaign.findMany.mockResolvedValue([]);
    mockPrisma.givingLink.groupBy.mockResolvedValue([]);
    mockPrisma.externalDonation.groupBy.mockResolvedValue([]);
    mockPrisma.eventRegistration.groupBy.mockResolvedValue([]);
    mockPrisma.eventRegistration.findMany.mockResolvedValue([]);
    mockPrisma.eventAttendee.findMany.mockResolvedValue([]);
    mockPrisma.pledge.groupBy.mockResolvedValue([]);
    mockPrisma.$queryRaw.mockResolvedValue([
      { kind: "PAGE", entity_id: "L1", amount: BigInt(4200), payments: BigInt(2), donors: BigInt(2), registrations: BigInt(0), attendees: BigInt(0), is_rollup: false },
    ]);
  });

  it("scopes every catalog query by the session churchId and passes the team scope + date range to SQL", async () => {
    const gte = new Date("2026-03-01T00:00:00Z");
    const r = await getWhereMoneyCameFrom("church_1", { gte }, "user_7");
    for (const m of [mockPrisma.givingLink.findMany, mockPrisma.event.findMany, mockPrisma.fundraisingCampaign.findMany, mockPrisma.pledgeCampaign.findMany]) {
      expect(m.mock.calls[0][0].where.churchId).toBe("church_1");
    }
    const sql = mockPrisma.$queryRaw.mock.calls[0][0];
    expect(sql.values).toEqual(expect.arrayContaining(["church_1", "user_7", gte]));
    expect(mockPrisma.pledge.groupBy.mock.calls[0][0].where.attributedUserId).toBe("user_7");
    expect(r.givingPages.totalCents).toBe(4200);
    expect(r.totalCents).toBe(4200);
  });

  it("returns an all-empty result when nothing matched", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    const r = await getWhereMoneyCameFrom("church_1", undefined);
    expect(r.totalCents).toBe(0);
    expect(r.events.rows).toEqual([]);
  });
});

describe("getCampaignsRaisedCentsBatch — matches getCampaignRaisedCents formula", () => {
  beforeEach(() => vi.clearAllMocks());

  it("nets refunds/returns off link counters and adds external donations", async () => {
    mockPrisma.givingLink.groupBy.mockResolvedValue([
      { fundraisingCampaignId: "C1", _sum: { totalCollectedCents: 10_000, refundedCents: 1_000, returnedCents: 500 } },
    ]);
    mockPrisma.externalDonation.groupBy.mockResolvedValue([{ fundraisingCampaignId: "C1", _sum: { donationAmountCents: 2_000 } }]);
    const m = await getCampaignsRaisedCentsBatch("church_1", ["C1", "C2"]);
    expect(m.get("C1")).toBe(10_500);
    expect(m.get("C2")).toBe(0);
    expect(mockPrisma.externalDonation.groupBy.mock.calls[0][0].where.status).toEqual({ notIn: ["RETURNED", "VOIDED"] });
  });

  it("makes no queries for an empty id list", async () => {
    const m = await getCampaignsRaisedCentsBatch("church_1", []);
    expect(m.size).toBe(0);
    expect(mockPrisma.givingLink.groupBy).not.toHaveBeenCalled();
  });
});

describe("who paid (per-row transactions)", () => {
  const tx = (over: Partial<SourceTransaction>): SourceTransaction => ({
    kind: "PAGE",
    entityId: "L1",
    transferId: "t1",
    registrationId: null,
    amountCents: 1000,
    createdAt: new Date("2026-09-10T12:00:00Z"),
    donorId: "d1",
    donorName: "Pat Giver",
    isAnonymous: false,
    ...over,
  });
  const cat = emptyCatalogs({
    givingLinks: [{ id: "L1", internalName: "a", publicTitle: "A" }],
    events: [{ id: "E1", name: "Gala" }],
  });

  it("attaches each payment to its own row only", () => {
    const r = assembleWhereMoneyCameFrom(
      [
        group({ kind: "PAGE", entityId: "L1", amountCents: 1000, payments: 1, donors: 1 }),
        group({ kind: "EVENT", entityId: "E1", amountCents: 500, payments: 1, donors: 1 }),
      ],
      cat,
      [tx({}), tx({ kind: "EVENT", entityId: "E1", transferId: "t2", donorName: "Ev Buyer" })]
    );
    expect(r.givingPages.rows[0].transactions.map((t) => t.donorName)).toEqual(["Pat Giver"]);
    expect(r.events.rows[0].transactions.map((t) => t.donorName)).toEqual(["Ev Buyer"]);
  });

  it("puts unlinked and unknown-entity payments in the unattributed list", () => {
    const r = assembleWhereMoneyCameFrom(
      [group({ kind: "OTHER", entityId: null, amountCents: 700, payments: 1 })],
      cat,
      [
        tx({ kind: "OTHER", entityId: null, transferId: "t3", donorName: null, donorId: null }),
        tx({ kind: "EVENT", entityId: "GONE", transferId: "t4" }),
        tx({ transferId: "t5" }),
      ]
    );
    expect(r.other.transactions.map((t) => t.transferId).sort()).toEqual(["t3", "t4"]);
  });

  it("defaults to no transactions", () => {
    const r = assembleWhereMoneyCameFrom([group({ kind: "PAGE", entityId: "L1", amountCents: 1, payments: 1 })], cat);
    expect(r.givingPages.rows[0].transactions).toEqual([]);
  });

  it("caps per row inside SQL with a window function and uses the same success filter", () => {
    const q = buildSourceTransactionsQuery({ churchId: "church_1", linkAssignments: new Map() });
    expect(q.sql).toContain("ROW_NUMBER() OVER (PARTITION BY c.kind, c.entity_id");
    expect(q.sql).toContain("UPPER(t.state) = 'SUCCEEDED'");
    expect(q.sql).toContain('d."churchId" = t."churchId"');
    expect(q.values).toEqual(expect.arrayContaining(["church_1", TRANSACTIONS_PER_ROW]));
  });

  it("applies team scope to the transaction list too", () => {
    const q = buildSourceTransactionsQuery({ churchId: "c", attributedUserId: "user_3", linkAssignments: new Map() });
    expect(q.sql).toContain('p."attributedUserId" =');
    expect(q.values).toContain("user_3");
  });
});

describe("event attendees", () => {
  const att = (over: Partial<EventAttendeeInfo>): EventAttendeeInfo => ({
    id: "a1",
    eventId: "E1",
    registrationId: "R1",
    name: "Zed Zane",
    registrantName: "Amy Buyer",
    paidVia: "CARD",
    checkedIn: false,
    ...over,
  });
  const cat = emptyCatalogs({ events: [{ id: "E1", name: "Gala" }, { id: "E2", name: "Other" }] });
  const g = [
    group({ kind: "EVENT", entityId: "E1", amountCents: 500, payments: 1, donors: 1 }),
    group({ kind: "EVENT", entityId: "E2", amountCents: 100, payments: 1, donors: 1 }),
  ];

  it("lists attendees under their own event only, sorted by name", () => {
    const r = assembleWhereMoneyCameFrom(g, cat, [], [
      att({ id: "a2", name: "Mia Moss" }),
      att({ id: "a1", name: "Abe Ames" }),
      att({ id: "a3", eventId: "E2", name: "Other Person" }),
    ]);
    expect(r.events.rows.find((e) => e.id === "E1")!.attendeeList.map((a) => a.name)).toEqual(["Abe Ames", "Mia Moss"]);
    expect(r.events.rows.find((e) => e.id === "E2")!.attendeeList.map((a) => a.name)).toEqual(["Other Person"]);
  });

  it("defaults to an empty attendee list", () => {
    const r = assembleWhereMoneyCameFrom(g, cat);
    expect(r.events.rows.every((e) => e.attendeeList.length === 0)).toBe(true);
  });

  it("fetchEventAttendees scopes by church, confirmed status, and the team user's own door sales", async () => {
    mockPrisma.eventRegistration.findMany.mockResolvedValue([
      { id: "R1", eventId: "E1", registrantFirstName: "Amy", registrantLastName: "Buyer", paymentMethod: null },
      { id: "R2", eventId: "E1", registrantFirstName: "Cal", registrantLastName: "Door", paymentMethod: "CASH" },
    ]);
    mockPrisma.eventAttendee.findMany.mockResolvedValue([
      { id: "a1", registrationId: "R1", firstName: "Zed", lastName: "Zane", checkedIn: true },
      { id: "a2", registrationId: "R2", firstName: "Cal", lastName: "Door", checkedIn: false },
    ]);
    const out = await fetchEventAttendees({
      churchId: "church_1",
      processedRegistrationIds: ["R1"],
      rangeFilter: { gte: new Date("2026-09-01") },
      attributedUserId: "user_4",
    });
    const where = mockPrisma.eventRegistration.findMany.mock.calls[0][0].where;
    expect(where.churchId).toBe("church_1");
    expect(where.status).toBe("CONFIRMED");
    expect(JSON.stringify(where.OR)).toContain("user_4");
    expect(mockPrisma.eventAttendee.findMany.mock.calls[0][0].where.churchId).toBe("church_1");
    expect(out.find((a) => a.id === "a1")).toMatchObject({ paidVia: "CARD", checkedIn: true, registrantName: "Amy Buyer" });
    expect(out.find((a) => a.id === "a2")!.paidVia).toBe("CASH");
  });

  it("returns nothing (and skips the attendee query) when there are no registrations", async () => {
    mockPrisma.eventRegistration.findMany.mockResolvedValue([]);
    mockPrisma.eventAttendee.findMany.mockClear();
    expect(await fetchEventAttendees({ churchId: "c", processedRegistrationIds: [] })).toEqual([]);
    expect(mockPrisma.eventAttendee.findMany).not.toHaveBeenCalled();
  });
});
