/**
 * The rules of bidding, as pure functions with no database in them, so they can be tested exhaustively and
 * reused by the public bid route, the live-room control screen and the settlement job.
 * Money is always integer cents.
 */

export const MAX_BID_CENTS = 100_000_000; // $1,000,000 — a typo guard, not a business limit.

export interface BiddableItem {
  startingBidCents: number;
  minIncrementCents: number;
  currentBidCents: number | null;
  highBidderId: string | null;
  endsAt: Date;
  status: string;
}

export interface BiddableAuction {
  status: string;
  startsAt: Date;
}

/** The lowest bid that would be accepted on this item right now. */
export function minimumNextBidCents(item: Pick<BiddableItem, "startingBidCents" | "minIncrementCents" | "currentBidCents">): number {
  return item.currentBidCents == null ? item.startingBidCents : item.currentBidCents + item.minIncrementCents;
}

export type BidRejection = "AUCTION_NOT_OPEN" | "ITEM_NOT_STARTED" | "ITEM_CLOSED" | "BAD_AMOUNT" | "TOO_LOW" | "ALREADY_HIGH_BIDDER";

export type BidCheck = { ok: true } | { ok: false; reason: BidRejection; minimumCents?: number };

/** Whether a bid would be acceptable on a snapshot of the item. The database still decides any race (see placeBid). */
export function checkBid(params: { auction: BiddableAuction; item: BiddableItem; bidderId: string; amountCents: number; now: Date }): BidCheck {
  const { auction, item, bidderId, amountCents, now } = params;
  if (auction.status !== "OPEN" || now < auction.startsAt) return { ok: false, reason: "AUCTION_NOT_OPEN" };
  // Live auctions run one item at a time: an item not yet on the block cannot be bid on.
  if (item.status === "UPCOMING") return { ok: false, reason: "ITEM_NOT_STARTED" };
  if (item.status !== "OPEN" || now >= item.endsAt) return { ok: false, reason: "ITEM_CLOSED" };
  if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > MAX_BID_CENTS) return { ok: false, reason: "BAD_AMOUNT" };
  const minimumCents = minimumNextBidCents(item);
  if (amountCents < minimumCents) return { ok: false, reason: "TOO_LOW", minimumCents };
  if (item.highBidderId === bidderId) return { ok: false, reason: "ALREADY_HIGH_BIDDER" };
  return { ok: true };
}

/**
 * Auto-extend: a bid inside the last `windowMinutes` of an item pushes its close to `extendMinutes` after the bid,
 * so nobody wins by bidding in the last seconds. Returns the new closing time, or null when nothing changes.
 */
export function extendedEndsAt(params: { itemEndsAt: Date; now: Date; windowMinutes: number; extendMinutes: number }): Date | null {
  const { itemEndsAt, now, windowMinutes, extendMinutes } = params;
  if (windowMinutes <= 0 || extendMinutes <= 0) return null;
  const remainingMs = itemEndsAt.getTime() - now.getTime();
  if (remainingMs > windowMinutes * 60_000) return null;
  const candidate = new Date(now.getTime() + extendMinutes * 60_000);
  return candidate > itemEndsAt ? candidate : null;
}

/** Splits a winner's total into the part that is the value of the goods and the part that is a charitable gift. */
export function splitWinnings(wins: { amountCents: number; fairMarketValueCents: number }[]): {
  totalCents: number;
  goodsServicesValueCents: number;
  charitablePortionCents: number;
} {
  let totalCents = 0;
  let goodsServicesValueCents = 0;
  for (const win of wins) {
    totalCents += win.amountCents;
    // Never count more than was paid as "value received": a bid below fair market value is all goods.
    goodsServicesValueCents += Math.min(Math.max(win.fairMarketValueCents, 0), win.amountCents);
  }
  return { totalCents, goodsServicesValueCents, charitablePortionCents: totalCents - goodsServicesValueCents };
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
