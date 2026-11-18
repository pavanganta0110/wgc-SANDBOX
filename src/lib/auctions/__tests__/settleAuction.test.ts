import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("../auctionEmails", () => ({ sendWinnerEmail: vi.fn().mockResolvedValue(true), sendNextBidderOfferEmail: vi.fn().mockResolvedValue(true) }));

const prismaMock = vi.hoisted(() => {
  const m: any = {
    auction: { findUnique: vi.fn(), updateMany: vi.fn() },
    auctionItem: { findMany: vi.fn(), updateMany: vi.fn(), count: vi.fn(), update: vi.fn() },
    auctionWin: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
    auctionBid: { findMany: vi.fn() },
    auctionBidder: { findUnique: vi.fn() },
    invoice: { findUnique: vi.fn(), updateMany: vi.fn() },
  };
  m.$transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(m));
  return m;
});
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { offerOverdueWins, releaseStaleClaims, settleAuction } from "../settleAuction";

const now = new Date("2026-11-20T21:00:00Z");
const auction = { id: "a1", churchId: "c1", status: "OPEN", offerNextBidder: true, paymentWindowHours: 72 };
const due = (over: Record<string, unknown> = {}) => ({ id: "i1", endsAt: new Date("2026-11-20T20:00:00Z"), bidCount: 3, highBidderId: "b1", currentBidCents: 9_000, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.auction.findUnique.mockResolvedValue(auction);
  prismaMock.auction.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.auctionItem.findMany.mockResolvedValue([due()]);
  prismaMock.auctionItem.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.auctionItem.count.mockResolvedValue(0);
  prismaMock.auctionWin.findMany.mockResolvedValue([]);
  prismaMock.auctionWin.create.mockResolvedValue({});
});

describe("settleAuction", () => {
  it("closes a due item with a compare-and-set on the high bid it read, and records one win", async () => {
    const outcome = await settleAuction("a1", now);
    expect(outcome).toMatchObject({ itemsClosed: 1, itemsSold: 1, settled: true });
    expect(prismaMock.auctionItem.updateMany).toHaveBeenCalledWith({
      where: { id: "i1", status: "OPEN", endsAt: { lte: now }, currentBidCents: 9_000, highBidderId: "b1" },
      data: expect.objectContaining({ status: "SOLD", winnerBidderId: "b1", winningBidCents: 9_000 }),
    });
    expect(prismaMock.auctionWin.create).toHaveBeenCalledWith({ data: expect.objectContaining({ itemId: "i1", bidderId: "b1", amountCents: 9_000 }) });
  });

  it("a second run at the same moment creates no second win", async () => {
    prismaMock.auctionItem.updateMany.mockResolvedValue({ count: 0 }); // the other run already closed it
    const outcome = await settleAuction("a1", now);
    expect(outcome.itemsClosed).toBe(0);
    expect(prismaMock.auctionWin.create).not.toHaveBeenCalled();
  });

  it("an existing win for the item (unique key) is not an error", async () => {
    prismaMock.auctionWin.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }));
    await expect(settleAuction("a1", now)).resolves.toMatchObject({ itemsClosed: 1 });
  });

  it("an item nobody bid on closes as unsold with no win", async () => {
    prismaMock.auctionItem.findMany.mockResolvedValue([due({ bidCount: 0, highBidderId: null, currentBidCents: null })]);
    const outcome = await settleAuction("a1", now);
    expect(outcome).toMatchObject({ itemsClosed: 1, itemsSold: 0 });
    expect(prismaMock.auctionItem.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "UNSOLD", winnerBidderId: null }) }));
    expect(prismaMock.auctionWin.create).not.toHaveBeenCalled();
  });

  it("stays open while another item is still taking bids", async () => {
    prismaMock.auctionItem.count.mockResolvedValue(1);
    expect((await settleAuction("a1", now)).settled).toBe(false);
    expect(prismaMock.auction.updateMany).not.toHaveBeenCalled();
  });

  it("does nothing for a draft or already settled auction", async () => {
    prismaMock.auction.findUnique.mockResolvedValue({ ...auction, status: "DRAFT" });
    expect(await settleAuction("a1", now)).toMatchObject({ itemsClosed: 0 });
    prismaMock.auction.findUnique.mockResolvedValue({ ...auction, status: "SETTLED" });
    expect(await settleAuction("a1", now)).toMatchObject({ itemsClosed: 0, settled: true });
    expect(prismaMock.auctionItem.findMany).not.toHaveBeenCalled();
  });

  it("when another run already claimed a bidder's wins for invoicing, no invoice is made", async () => {
    prismaMock.auctionWin.findMany.mockResolvedValueOnce([{ id: "w1", bidderId: "b1" }]);
    prismaMock.auctionWin.updateMany.mockResolvedValue({ count: 0 });
    const outcome = await settleAuction("a1", now);
    expect(outcome.invoicesCreated).toBe(0);
  });
});

describe("offerOverdueWins", () => {
  const win = { id: "w1", auctionId: "a1", itemId: "i1", bidderId: "b1", amountCents: 9_000, invoiceId: "inv1", status: "PENDING_PAYMENT", dueAt: new Date("2026-11-20T00:00:00Z") };
  beforeEach(() => {
    prismaMock.auctionWin.findMany.mockResolvedValue([win]);
    prismaMock.invoice.findUnique.mockResolvedValue({ status: "SENT" });
    prismaMock.auctionWin.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.auctionWin.count.mockResolvedValue(0);
    prismaMock.invoice.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.auctionItem.update.mockResolvedValue({});
  });

  it("offers the item to the next-highest bidder who has not had a turn, and voids the lapsed invoice", async () => {
    prismaMock.auctionBid.findMany.mockResolvedValue([
      { bidderId: "b1", amountCents: 9_000 }, { bidderId: "b2", amountCents: 8_000 }, { bidderId: "b1", amountCents: 7_000 }, { bidderId: "b3", amountCents: 6_000 },
    ]);
    prismaMock.auctionBidder.findUnique.mockResolvedValue({ status: "APPROVED" });
    const result = await offerOverdueWins(now);
    expect(result).toEqual({ offered: 1, forfeited: 0 });
    // b2 is next: b1 (the holder) never gets a second turn at a lower bid.
    expect(prismaMock.auctionWin.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ bidderId: "b2", amountCents: 8_000, offeredFromBidderId: "b1", invoiceId: null }) }));
    expect(prismaMock.invoice.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "VOID" }) }));
  });

  it("marks the win forfeited when nobody is next in line or the auction does not offer onward", async () => {
    prismaMock.auctionBid.findMany.mockResolvedValue([{ bidderId: "b1", amountCents: 9_000 }]);
    expect(await offerOverdueWins(now)).toEqual({ offered: 0, forfeited: 1 });
    prismaMock.auction.findUnique.mockResolvedValue({ ...auction, offerNextBidder: false });
    expect(await offerOverdueWins(now)).toEqual({ offered: 0, forfeited: 1 });
  });

  it("skips a bidder who was blocked or declined and moves to the next", async () => {
    prismaMock.auctionBid.findMany.mockResolvedValue([{ bidderId: "b1", amountCents: 9_000 }, { bidderId: "b2", amountCents: 8_000 }, { bidderId: "b3", amountCents: 7_000 }]);
    prismaMock.auctionBidder.findUnique.mockResolvedValueOnce({ status: "BLOCKED" }).mockResolvedValueOnce({ status: "APPROVED" });
    await offerOverdueWins(now);
    expect(prismaMock.auctionWin.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ bidderId: "b3", amountCents: 7_000 }) }));
  });

  it("leaves a win alone whose invoice was paid in the meantime", async () => {
    prismaMock.invoice.findUnique.mockResolvedValue({ status: "PAID" });
    expect(await offerOverdueWins(now)).toEqual({ offered: 0, forfeited: 0 });
    expect(prismaMock.auctionWin.updateMany).not.toHaveBeenCalled();
  });
});

describe("releaseStaleClaims", () => {
  it("frees only claims older than 15 minutes that never produced an invoice", async () => {
    prismaMock.auctionWin.updateMany.mockResolvedValue({ count: 2 });
    expect(await releaseStaleClaims(now)).toBe(2);
    expect(prismaMock.auctionWin.updateMany).toHaveBeenCalledWith({ where: { invoiceId: null, invoiceClaimedAt: { lt: new Date(now.getTime() - 15 * 60_000) } }, data: { invoiceClaimedAt: null } });
  });
});
