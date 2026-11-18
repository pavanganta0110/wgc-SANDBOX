import { describe, it, expect } from "vitest";
import { checkBid, extendedEndsAt, minimumNextBidCents, splitWinnings, MAX_BID_CENTS } from "../bidRules";

const now = new Date("2026-11-20T18:00:00Z");
const auction = { status: "OPEN", startsAt: new Date("2026-11-20T12:00:00Z") };
const item = (over: Partial<Parameters<typeof checkBid>[0]["item"]> = {}) => ({
  startingBidCents: 5_000, minIncrementCents: 500, currentBidCents: null, highBidderId: null, endsAt: new Date("2026-11-20T20:00:00Z"), status: "OPEN", ...over,
});

describe("minimumNextBidCents", () => {
  it("is the starting bid until someone bids, then the high bid plus the raise", () => {
    expect(minimumNextBidCents(item())).toBe(5_000);
    expect(minimumNextBidCents(item({ currentBidCents: 7_000 }))).toBe(7_500);
  });
});

describe("checkBid", () => {
  it("accepts a bid at the starting bid and at the minimum raise", () => {
    expect(checkBid({ auction, item: item(), bidderId: "b1", amountCents: 5_000, now })).toEqual({ ok: true });
    expect(checkBid({ auction, item: item({ currentBidCents: 7_000, highBidderId: "b2" }), bidderId: "b1", amountCents: 7_500, now })).toEqual({ ok: true });
  });
  it("rejects below the minimum and says what the minimum is", () => {
    expect(checkBid({ auction, item: item({ currentBidCents: 7_000, highBidderId: "b2" }), bidderId: "b1", amountCents: 7_499, now })).toEqual({ ok: false, reason: "TOO_LOW", minimumCents: 7_500 });
  });
  it("rejects a bid from the current high bidder", () => {
    expect(checkBid({ auction, item: item({ currentBidCents: 7_000, highBidderId: "b1" }), bidderId: "b1", amountCents: 9_000, now })).toMatchObject({ reason: "ALREADY_HIGH_BIDDER" });
  });
  it("rejects bids before the start, after the item closes, on a closed item, and on a draft auction", () => {
    expect(checkBid({ auction: { ...auction, startsAt: new Date("2026-11-21T00:00:00Z") }, item: item(), bidderId: "b1", amountCents: 5_000, now })).toMatchObject({ reason: "AUCTION_NOT_OPEN" });
    expect(checkBid({ auction: { ...auction, status: "DRAFT" }, item: item(), bidderId: "b1", amountCents: 5_000, now })).toMatchObject({ reason: "AUCTION_NOT_OPEN" });
    expect(checkBid({ auction, item: item({ endsAt: now }), bidderId: "b1", amountCents: 5_000, now })).toMatchObject({ reason: "ITEM_CLOSED" });
    expect(checkBid({ auction, item: item({ status: "SOLD" }), bidderId: "b1", amountCents: 5_000, now })).toMatchObject({ reason: "ITEM_CLOSED" });
  });
  it("rejects non-integer, zero, negative and absurd amounts", () => {
    for (const amountCents of [0, -500, 50.5, NaN, MAX_BID_CENTS + 1]) {
      expect(checkBid({ auction, item: item(), bidderId: "b1", amountCents, now })).toMatchObject({ reason: "BAD_AMOUNT" });
    }
  });
});

describe("extendedEndsAt (anti-sniping)", () => {
  const endsAt = new Date("2026-11-20T18:03:00Z");
  it("pushes the close out when a bid lands inside the window", () => {
    expect(extendedEndsAt({ itemEndsAt: endsAt, now, windowMinutes: 5, extendMinutes: 5 })).toEqual(new Date("2026-11-20T18:05:00Z"));
  });
  it("leaves it alone outside the window, when turned off, or when it would not be later", () => {
    expect(extendedEndsAt({ itemEndsAt: new Date("2026-11-20T19:00:00Z"), now, windowMinutes: 5, extendMinutes: 5 })).toBeNull();
    expect(extendedEndsAt({ itemEndsAt: endsAt, now, windowMinutes: 0, extendMinutes: 5 })).toBeNull();
    expect(extendedEndsAt({ itemEndsAt: endsAt, now, windowMinutes: 5, extendMinutes: 1 })).toBeNull();
  });
});

describe("splitWinnings (what is a gift on the receipt)", () => {
  it("only the amount above fair market value is charitable", () => {
    expect(splitWinnings([{ amountCents: 30_000, fairMarketValueCents: 20_000 }])).toEqual({ totalCents: 30_000, goodsServicesValueCents: 20_000, charitablePortionCents: 10_000 });
  });
  it("a bid below fair market value is all goods, never a negative gift", () => {
    expect(splitWinnings([{ amountCents: 15_000, fairMarketValueCents: 20_000 }])).toEqual({ totalCents: 15_000, goodsServicesValueCents: 15_000, charitablePortionCents: 0 });
  });
  it("adds several items together", () => {
    expect(splitWinnings([{ amountCents: 10_000, fairMarketValueCents: 4_000 }, { amountCents: 5_000, fairMarketValueCents: 5_000 }])).toEqual({ totalCents: 15_000, goodsServicesValueCents: 9_000, charitablePortionCents: 6_000 });
  });
});
