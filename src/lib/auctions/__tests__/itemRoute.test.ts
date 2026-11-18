import { describe, it, expect, vi, beforeEach } from "vitest";

const guard = vi.hoisted(() => ({ guardAuctionsRoute: vi.fn(), loadOwnedAuction: vi.fn(), auctionNotFound: vi.fn() }));
vi.mock("@/lib/auctions/merchantGuard", () => guard);
const prismaMock = vi.hoisted(() => ({ auctionItem: { findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { DELETE, PATCH } from "@/app/api/merchant/auctions/[auctionId]/items/[itemId]/route";

const ctx = { params: Promise.resolve({ auctionId: "a1", itemId: "i1" }) };
const row = (over: Record<string, unknown> = {}) => ({ id: "i1", title: "Quilt", description: null, imageUrl: null, donatedBy: null, category: null, startingBidCents: 5000, minIncrementCents: 500, fairMarketValueCents: 6000, status: "OPEN", bidCount: 0, ...over });
const patch = (body: unknown) => PATCH(new Request("https://x.test/i", { method: "PATCH", body: JSON.stringify(body) }), ctx);
const del = () => DELETE(new Request("https://x.test/i", { method: "DELETE" }), ctx);

beforeEach(() => {
  vi.clearAllMocks();
  guard.guardAuctionsRoute.mockResolvedValue({ auth: { churchId: "c1" } });
  guard.loadOwnedAuction.mockResolvedValue({ id: "a1" });
  prismaMock.auctionItem.findFirst.mockResolvedValue(row());
  prismaMock.auctionItem.update.mockResolvedValue({});
});

describe("editing an item", () => {
  it("works on an open item and on one still waiting its turn in a live auction", async () => {
    expect((await patch({ imageUrl: "https://x.test/a.png" })).status).toBe(200);
    prismaMock.auctionItem.findFirst.mockResolvedValue(row({ status: "UPCOMING" }));
    expect((await patch({ imageUrl: "https://x.test/a.png" })).status).toBe(200);
    expect(prismaMock.auctionItem.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: expect.objectContaining({ imageUrl: "https://x.test/a.png" }) });
  });
  it("refuses a sold, passed or withdrawn item", async () => {
    for (const status of ["SOLD", "UNSOLD", "WITHDRAWN"]) {
      prismaMock.auctionItem.findFirst.mockResolvedValue(row({ status }));
      expect((await patch({ title: "New" })).status).toBe(409);
    }
    expect(prismaMock.auctionItem.update).not.toHaveBeenCalled();
  });
  it("fixes the money once there are bids", async () => {
    prismaMock.auctionItem.findFirst.mockResolvedValue(row({ bidCount: 2 }));
    expect((await patch({ startingBidCents: 9000 })).status).toBe(409);
    expect((await patch({ description: "More detail" })).status).toBe(200);
  });
});

describe("removing an item", () => {
  it("deletes an item with no bids, open or still waiting its turn", async () => {
    expect(await (await del()).json()).toEqual({ success: true, removed: true });
    prismaMock.auctionItem.findFirst.mockResolvedValue(row({ status: "UPCOMING" }));
    expect(await (await del()).json()).toEqual({ success: true, removed: true });
    expect(prismaMock.auctionItem.delete).toHaveBeenCalledTimes(2);
  });
  it("withdraws an item that has bids, and refuses one that already ran", async () => {
    prismaMock.auctionItem.findFirst.mockResolvedValue(row({ bidCount: 3 }));
    expect(await (await del()).json()).toEqual({ success: true, removed: false });
    expect(prismaMock.auctionItem.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: expect.objectContaining({ status: "WITHDRAWN" }) });
    prismaMock.auctionItem.findFirst.mockResolvedValue(row({ status: "SOLD" }));
    expect((await del()).status).toBe(409);
  });
  it("only touches this organization's auction", async () => {
    await del();
    expect(prismaMock.auctionItem.findFirst).toHaveBeenCalledWith({ where: { id: "i1", auctionId: "a1", churchId: "c1" } });
  });
});
