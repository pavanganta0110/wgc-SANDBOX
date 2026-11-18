import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

const sendOutbidEmail = vi.hoisted(() => vi.fn().mockResolvedValue(true));
vi.mock("../auctionEmails", () => ({ sendOutbidEmail }));

const prismaMock = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m: any = {
    auction: { findUnique: vi.fn() },
    auctionBidder: { findFirst: vi.fn(), findUnique: vi.fn() },
    auctionItem: { findFirst: vi.fn(), updateMany: vi.fn() },
    auctionBid: { create: vi.fn() },
  };
  m.$transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(m));
  return m;
});
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { placeBid } from "../placeBid";

const now = new Date("2026-11-20T18:00:00Z");
const auction = { id: "a1", churchId: "c1", title: "Gala", slug: "gala-1", status: "OPEN", startsAt: new Date("2026-11-20T12:00:00Z"), autoExtendWindowMinutes: 5, autoExtendMinutes: 5 };
const item = (over: Record<string, unknown> = {}) => ({ id: "i1", title: "Quilt", startingBidCents: 5_000, minIncrementCents: 500, currentBidCents: null, highBidderId: null, endsAt: new Date("2026-11-20T20:00:00Z"), status: "OPEN", ...over });
const bid = (amountCents: number, bidderId = "b1") => placeBid({ auctionId: "a1", itemId: "i1", bidderId, amountCents, source: "ONLINE", now });

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.auction.findUnique.mockResolvedValue(auction);
  prismaMock.auctionBidder.findFirst.mockResolvedValue({ id: "b1", status: "APPROVED" });
  prismaMock.auctionItem.findFirst.mockResolvedValue(item());
  prismaMock.auctionItem.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.auctionBid.create.mockResolvedValue({});
});

describe("placeBid", () => {
  it("accepts a bid with a compare-and-set on the high bid it read, and records the bid", async () => {
    const result = await bid(5_000);
    expect(result).toMatchObject({ ok: true, currentBidCents: 5_000, extended: false, outbidBidderId: null });
    expect(prismaMock.auctionItem.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "i1", status: "OPEN", currentBidCents: null, highBidderId: null }),
      data: expect.objectContaining({ currentBidCents: 5_000, highBidderId: "b1", bidCount: { increment: 1 } }),
    }));
    expect(prismaMock.auctionBid.create).toHaveBeenCalledWith({ data: expect.objectContaining({ itemId: "i1", bidderId: "b1", amountCents: 5_000, source: "ONLINE" }) });
  });

  it("only lets an approved bidder of this auction and organization bid", async () => {
    prismaMock.auctionBidder.findFirst.mockResolvedValue(null);
    expect(await bid(5_000)).toEqual({ ok: false, reason: "BIDDER_NOT_ALLOWED" });
    prismaMock.auctionBidder.findFirst.mockResolvedValue({ id: "b1", status: "PENDING" });
    expect(await bid(5_000)).toEqual({ ok: false, reason: "BIDDER_NOT_ALLOWED" });
    expect(prismaMock.auctionBidder.findFirst).toHaveBeenCalledWith({ where: { id: "b1", auctionId: "a1", churchId: "c1" } });
    expect(prismaMock.auctionBid.create).not.toHaveBeenCalled();
  });

  it("rejects a bid that is too low without writing anything", async () => {
    prismaMock.auctionItem.findFirst.mockResolvedValue(item({ currentBidCents: 7_000, highBidderId: "b2" }));
    expect(await bid(7_100)).toEqual({ ok: false, reason: "TOO_LOW", minimumCents: 7_500 });
    expect(prismaMock.auctionItem.updateMany).not.toHaveBeenCalled();
  });

  it("when someone else bids first, re-reads and decides again against the new high bid", async () => {
    prismaMock.auctionItem.updateMany.mockResolvedValueOnce({ count: 0 });
    prismaMock.auctionItem.findFirst.mockResolvedValueOnce(item()).mockResolvedValueOnce(item({ currentBidCents: 6_000, highBidderId: "b2" }));
    // Our 5,500 was fine against the old state but is below 6,000 + 500 now.
    expect(await bid(5_500)).toEqual({ ok: false, reason: "TOO_LOW", minimumCents: 6_500 });
    expect(prismaMock.auctionBid.create).not.toHaveBeenCalled();
  });

  it("when the race is lost but the bid still beats the new high bid, it goes through on the second try", async () => {
    prismaMock.auctionItem.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    prismaMock.auctionItem.findFirst.mockResolvedValueOnce(item()).mockResolvedValueOnce(item({ currentBidCents: 6_000, highBidderId: "b2" }));
    const result = await bid(9_000);
    expect(result).toMatchObject({ ok: true, currentBidCents: 9_000, outbidBidderId: "b2" });
  });

  it("a duplicate amount refused by the database counts as a lost race, never a double bid", async () => {
    prismaMock.auctionBid.create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }));
    prismaMock.auctionItem.findFirst.mockResolvedValueOnce(item()).mockResolvedValueOnce(item({ currentBidCents: 6_000, highBidderId: "b2" }));
    expect(await bid(6_000)).toMatchObject({ ok: false, reason: "TOO_LOW" });
  });

  it("extends the closing time for a bid inside the last minutes", async () => {
    prismaMock.auctionItem.findFirst.mockResolvedValue(item({ endsAt: new Date("2026-11-20T18:02:00Z") }));
    const result = await bid(5_000);
    expect(result).toMatchObject({ ok: true, extended: true, endsAt: new Date("2026-11-20T18:05:00Z") });
    expect(prismaMock.auctionItem.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ endsAt: new Date("2026-11-20T18:05:00Z") }) }));
  });

  it("in a live-room auction, a bid with more than 30 seconds left does not stretch the item to minutes", async () => {
    prismaMock.auction.findUnique.mockResolvedValue({ ...auction, format: "LIVE" });
    prismaMock.auctionItem.findFirst.mockResolvedValue(item({ endsAt: new Date("2026-11-20T18:02:00Z") })); // 2 minutes left
    const result = await bid(5_000);
    expect(result).toMatchObject({ ok: true, extended: false, endsAt: new Date("2026-11-20T18:02:00Z") });
  });

  it("in a live-room auction, a bid in the last 30 seconds adds 30 seconds", async () => {
    prismaMock.auction.findUnique.mockResolvedValue({ ...auction, format: "LIVE" });
    prismaMock.auctionItem.findFirst.mockResolvedValue(item({ endsAt: new Date("2026-11-20T18:00:10Z") }));
    expect(await bid(5_000)).toMatchObject({ ok: true, extended: true, endsAt: new Date("2026-11-20T18:00:30Z") });
  });

  it("emails the bidder who was outbid, after the bid is in", async () => {
    prismaMock.auctionItem.findFirst.mockResolvedValue(item({ currentBidCents: 6_000, highBidderId: "b2" }));
    prismaMock.auctionBidder.findUnique.mockResolvedValue({ id: "b2", email: "prev@x.com", name: "Prev" });
    await bid(7_000);
    await new Promise((r) => setTimeout(r, 0));
    expect(sendOutbidEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "prev@x.com", newBidCents: 7_000, itemTitle: "Quilt" }));
  });

  it("an email failure never undoes the bid", async () => {
    prismaMock.auctionItem.findFirst.mockResolvedValue(item({ currentBidCents: 6_000, highBidderId: "b2" }));
    prismaMock.auctionBidder.findUnique.mockResolvedValue({ id: "b2", email: "prev@x.com", name: "Prev" });
    sendOutbidEmail.mockRejectedValueOnce(new Error("resend down"));
    expect(await bid(7_000)).toMatchObject({ ok: true });
  });

  it("an item from another auction or organization is not found", async () => {
    prismaMock.auctionItem.findFirst.mockResolvedValue(null);
    expect(await bid(5_000)).toEqual({ ok: false, reason: "NOT_FOUND" });
    expect(prismaMock.auctionItem.findFirst).toHaveBeenCalledWith({ where: { id: "i1", auctionId: "a1", churchId: "c1" } });
  });
});
