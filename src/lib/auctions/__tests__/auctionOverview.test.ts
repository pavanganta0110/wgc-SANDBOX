import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  auction: { findFirst: vi.fn() }, auctionBidder: { findMany: vi.fn() }, auctionBid: { findMany: vi.fn() }, auctionItem: { findMany: vi.fn() }, auctionWin: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { buildAuctionOverview } from "../auctionOverview";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.auction.findFirst.mockResolvedValue({ goalCents: 100_000 });
  prismaMock.auctionBidder.findMany.mockResolvedValue([{ status: "APPROVED" }, { status: "APPROVED" }, { status: "APPROVED" }, { status: "PENDING" }, { status: "DECLINED" }, { status: "BLOCKED" }]);
  prismaMock.auctionBid.findMany.mockResolvedValue([
    { bidderId: "b1", source: "ONLINE" }, { bidderId: "b2", source: "ONLINE" }, { bidderId: "b1", source: "ROOM" }, { bidderId: "b1", source: "ROOM" },
  ]);
  prismaMock.auctionItem.findMany.mockResolvedValue([
    { id: "i1", itemNumber: 1, title: "Cabin", status: "SOLD", bidCount: 3, fairMarketValueCents: 30_000 },
    { id: "i2", itemNumber: 2, title: "Football", status: "SOLD", bidCount: 1, fairMarketValueCents: 8_000 },
    { id: "i3", itemNumber: 3, title: "Unwanted", status: "UNSOLD", bidCount: 0, fairMarketValueCents: 1_000 },
    { id: "i4", itemNumber: 4, title: "Pulled", status: "WITHDRAWN", bidCount: 0, fairMarketValueCents: 0 },
  ]);
  prismaMock.auctionWin.findMany.mockResolvedValue([
    { itemId: "i1", bidderId: "b1", amountCents: 50_000, status: "PAID" },
    { itemId: "i2", bidderId: "b2", amountCents: 5_000, status: "PENDING_PAYMENT" },
    { itemId: "i9", bidderId: "b3", amountCents: 7_000, status: "FORFEITED" },
  ]);
});

describe("buildAuctionOverview", () => {
  it("counts who registered, who actually bid, and who won", async () => {
    const o = await buildAuctionOverview("a1", "c1");
    expect(o).toMatchObject({ registered: 6, approved: 3, waitingForApproval: 1, declinedOrBlocked: 2, participated: 2, winners: 2, totalBids: 4, onlineBids: 2, roomBids: 2 });
  });
  it("counts items, and leaves a withdrawn item out of the total", async () => {
    const o = await buildAuctionOverview("a1", "c1");
    expect(o).toMatchObject({ itemsTotal: 3, itemsSold: 2, itemsUnsold: 1, itemsWithdrawn: 1 });
  });
  it("adds up money: raised excludes a win nobody paid for, and paid and waiting are separate", async () => {
    const o = await buildAuctionOverview("a1", "c1");
    expect(o).toMatchObject({ raisedCents: 55_000, paidCents: 50_000, outstandingCents: 5_000, notPaidCents: 7_000, averageSaleCents: 27_500, goalPercent: 55 });
  });
  it("splits what was worth from what was a gift, never counting a bid below value as negative", async () => {
    const o = await buildAuctionOverview("a1", "c1");
    // Cabin: 50,000 paid vs 30,000 value; Football: 5,000 paid vs 8,000 value (all goods).
    expect(o.fairMarketValueSoldCents).toBe(35_000);
    expect(o.aboveValueCents).toBe(20_000);
  });
  it("ranks the top items and the most contested", async () => {
    const o = await buildAuctionOverview("a1", "c1");
    expect(o.topItems.map((i) => i.title)).toEqual(["Cabin", "Football"]);
    expect(o.mostContested.map((i) => i.title)).toEqual(["Cabin", "Football"]);
  });
  it("is all zeros, with no divide-by-zero, for an auction nobody joined", async () => {
    prismaMock.auctionBidder.findMany.mockResolvedValue([]);
    prismaMock.auctionBid.findMany.mockResolvedValue([]);
    prismaMock.auctionItem.findMany.mockResolvedValue([]);
    prismaMock.auctionWin.findMany.mockResolvedValue([]);
    prismaMock.auction.findFirst.mockResolvedValue({ goalCents: null });
    const o = await buildAuctionOverview("a1", "c1");
    expect(o).toMatchObject({ registered: 0, participated: 0, raisedCents: 0, averageSaleCents: null, goalPercent: null, topItems: [], mostContested: [] });
  });
  it("only reads this organization's rows", async () => {
    await buildAuctionOverview("a1", "c1");
    expect(prismaMock.auctionBid.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { auctionId: "a1", churchId: "c1" } }));
    expect(prismaMock.auctionWin.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { auctionId: "a1", churchId: "c1" } }));
  });
});
