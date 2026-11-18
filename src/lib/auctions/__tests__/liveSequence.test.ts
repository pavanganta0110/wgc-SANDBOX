import { describe, it, expect, vi, beforeEach } from "vitest";

const settleAuction = vi.hoisted(() => vi.fn().mockResolvedValue({ itemsClosed: 1, itemsSold: 1, invoicesCreated: 0, settled: false }));
vi.mock("../settleAuction", () => ({ settleAuction }));

const prismaMock = vi.hoisted(() => {
  const m: Record<string, unknown> = {
    auctionItem: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    auction: { update: vi.fn() },
  };
  m.$transaction = vi.fn(async (ops: unknown[]) => Promise.all(ops));
  return m as { auctionItem: Record<string, ReturnType<typeof vi.fn>>; auction: { update: ReturnType<typeof vi.fn> }; $transaction: ReturnType<typeof vi.fn> };
});
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { clampBlockSeconds, closeItemNow, reorderItems, startItem, startNextItem } from "../liveSequence";

const now = new Date("2026-11-20T18:00:00Z");
const live = { id: "a1", churchId: "c1", format: "LIVE", status: "OPEN" };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.auctionItem.findFirst.mockResolvedValue({ id: "i1", itemNumber: 1, status: "UPCOMING" });
  prismaMock.auctionItem.count.mockResolvedValue(0);
  prismaMock.auctionItem.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.auction.update.mockResolvedValue({});
});

describe("clampBlockSeconds", () => {
  it("keeps the time on the block between 30 seconds and 15 minutes", () => {
    expect(clampBlockSeconds(5)).toBe(30);
    expect(clampBlockSeconds(99999)).toBe(900);
    expect(clampBlockSeconds(120)).toBe(120);
    expect(clampBlockSeconds("abc")).toBe(120);
    expect(clampBlockSeconds(undefined)).toBe(120);
  });
});

describe("startItem", () => {
  it("opens the item for the chosen time and marks it as the one on the block", async () => {
    const result = await startItem({ auction: live, itemId: "i1", seconds: 180, now });
    expect(result).toMatchObject({ ok: true, itemId: "i1", endsAt: new Date("2026-11-20T18:03:00Z") });
    expect(prismaMock.auctionItem.updateMany).toHaveBeenCalledWith({ where: { id: "i1", status: "UPCOMING" }, data: { status: "OPEN", endsAt: new Date("2026-11-20T18:03:00Z") } });
    expect(prismaMock.auction.update).toHaveBeenCalledWith({ where: { id: "a1" }, data: { currentItemId: "i1" } });
  });
  it("only one item may be on the block at a time", async () => {
    prismaMock.auctionItem.count.mockResolvedValue(1);
    expect(await startItem({ auction: live, itemId: "i1", now })).toMatchObject({ ok: false, error: expect.stringMatching(/still on the block/) });
    expect(prismaMock.auctionItem.updateMany).not.toHaveBeenCalled();
  });
  it("refuses a silent auction, an unpublished one, a missing item, and an item that has already run", async () => {
    expect((await startItem({ auction: { ...live, format: "SILENT" }, itemId: "i1", now })).ok).toBe(false);
    expect((await startItem({ auction: { ...live, status: "DRAFT" }, itemId: "i1", now })).ok).toBe(false);
    prismaMock.auctionItem.findFirst.mockResolvedValue(null);
    expect((await startItem({ auction: live, itemId: "nope", now })).ok).toBe(false);
    prismaMock.auctionItem.findFirst.mockResolvedValue({ id: "i1", status: "SOLD" });
    expect(await startItem({ auction: live, itemId: "i1", now })).toMatchObject({ ok: false, error: expect.stringMatching(/already been run/) });
  });
  it("two staff pressing Start at once open it once: the loser's update matches nothing", async () => {
    prismaMock.auctionItem.updateMany.mockResolvedValue({ count: 0 });
    expect((await startItem({ auction: live, itemId: "i1", now })).ok).toBe(false);
    expect(prismaMock.auction.update).not.toHaveBeenCalled();
  });
  it("only looks inside this organization's auction", async () => {
    await startItem({ auction: live, itemId: "i1", now });
    expect(prismaMock.auctionItem.findFirst).toHaveBeenCalledWith({ where: { id: "i1", auctionId: "a1", churchId: "c1" } });
  });
});

describe("startNextItem", () => {
  it("takes the next waiting item in the running order", async () => {
    prismaMock.auctionItem.findFirst.mockResolvedValueOnce({ id: "i2" }).mockResolvedValueOnce({ id: "i2", status: "UPCOMING" });
    const result = await startNextItem({ auction: live, now });
    expect(result).toMatchObject({ ok: true, itemId: "i2" });
    expect(prismaMock.auctionItem.findFirst).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { auctionId: "a1", churchId: "c1", status: "UPCOMING" }, orderBy: [{ sortOrder: "asc" }, { itemNumber: "asc" }] }));
  });
  it("says so when every item has run", async () => {
    prismaMock.auctionItem.findFirst.mockResolvedValue(null);
    expect(await startNextItem({ auction: live, now })).toEqual({ ok: false, error: "No items are left to run." });
  });
});

describe("closeItemNow", () => {
  it("brings the closing time to now, then settles so the winner is recorded", async () => {
    prismaMock.auctionItem.findFirst.mockResolvedValue({ id: "i1", status: "OPEN" });
    const result = await closeItemNow({ auction: live, itemId: "i1", now });
    expect(result).toMatchObject({ ok: true, itemId: "i1" });
    expect(prismaMock.auctionItem.updateMany).toHaveBeenCalledWith({ where: { id: "i1", status: "OPEN", endsAt: { gt: now } }, data: { endsAt: now } });
    expect(settleAuction).toHaveBeenCalledWith("a1", now);
  });
  it("refuses an item that is not open", async () => {
    prismaMock.auctionItem.findFirst.mockResolvedValue({ id: "i1", status: "UPCOMING" });
    expect((await closeItemNow({ auction: live, itemId: "i1", now })).ok).toBe(false);
    expect(settleAuction).not.toHaveBeenCalled();
  });
});

describe("reorderItems", () => {
  it("numbers the items in the order given", async () => {
    prismaMock.auctionItem.findMany.mockResolvedValue([{ id: "i2", status: "UPCOMING" }, { id: "i1", status: "OPEN" }]);
    expect(await reorderItems({ auction: live, itemIds: ["i2", "i1"] })).toEqual({ ok: true });
    expect(prismaMock.auctionItem.update).toHaveBeenCalledWith({ where: { id: "i2" }, data: { sortOrder: 1 } });
    expect(prismaMock.auctionItem.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { sortOrder: 2 } });
  });
  it("refuses repeats, items from elsewhere, and items that have already run", async () => {
    expect((await reorderItems({ auction: live, itemIds: ["i1", "i1"] })).ok).toBe(false);
    expect((await reorderItems({ auction: live, itemIds: [] })).ok).toBe(false);
    prismaMock.auctionItem.findMany.mockResolvedValue([{ id: "i1", status: "UPCOMING" }]);
    expect((await reorderItems({ auction: live, itemIds: ["i1", "other"] })).ok).toBe(false);
    prismaMock.auctionItem.findMany.mockResolvedValue([{ id: "i1", status: "SOLD" }]);
    expect((await reorderItems({ auction: live, itemIds: ["i1"] })).ok).toBe(false);
    expect(prismaMock.auctionItem.update).not.toHaveBeenCalled();
  });
});
