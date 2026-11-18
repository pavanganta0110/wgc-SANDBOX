import { prisma } from "@/lib/prisma";
import { settleAuction, type SettleOutcome } from "./settleAuction";

/**
 * Running a live-room auction one item at a time. The staff member puts an item "on the block": it opens for bidding
 * for a set time (and, like any item, extends if a bid lands at the last moment). Only one item is open at once, so
 * the room and every phone are looking at the same thing. When time is up, or staff sell it, it closes and the
 * winner is recorded. Winners are invoiced once, at the very end, with everything they won together.
 */

export const MIN_BLOCK_SECONDS = 30;
export const MAX_BLOCK_SECONDS = 900;
export const DEFAULT_BLOCK_SECONDS = 120;

type AuctionRef = { id: string; churchId: string; format: string; status: string };

export type LiveResult = { ok: true; itemId: string; endsAt?: Date; outcome?: SettleOutcome } | { ok: false; error: string };

export function clampBlockSeconds(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_BLOCK_SECONDS;
  return Math.min(MAX_BLOCK_SECONDS, Math.max(MIN_BLOCK_SECONDS, Math.round(n)));
}

/** Opens an item for bidding. Refused unless the auction is live and open, the item has not run yet, and no other item is open. */
export async function startItem(params: { auction: AuctionRef; itemId: string; seconds?: unknown; now?: Date }): Promise<LiveResult> {
  const now = params.now ?? new Date();
  const { auction, itemId } = params;
  if (auction.format !== "LIVE") return { ok: false, error: "Only live-room auctions run one item at a time." };
  if (auction.status !== "OPEN") return { ok: false, error: "Publish the auction before starting items." };

  const item = await prisma.auctionItem.findFirst({ where: { id: itemId, auctionId: auction.id, churchId: auction.churchId } });
  if (!item) return { ok: false, error: "Item not found." };
  if (item.status !== "UPCOMING") return { ok: false, error: item.status === "OPEN" ? "That item is already on the block." : "That item has already been run." };

  const alreadyOpen = await prisma.auctionItem.count({ where: { auctionId: auction.id, status: "OPEN", endsAt: { gt: now } } });
  if (alreadyOpen > 0) return { ok: false, error: "Another item is still on the block. Sell it or pass on it first." };

  const endsAt = new Date(now.getTime() + clampBlockSeconds(params.seconds) * 1000);
  // Opens only while it is still waiting: two staff pressing Start at once open it once.
  const opened = await prisma.auctionItem.updateMany({ where: { id: item.id, status: "UPCOMING" }, data: { status: "OPEN", endsAt } });
  if (opened.count === 0) return { ok: false, error: "That item has already been started." };
  await prisma.auction.update({ where: { id: auction.id }, data: { currentItemId: item.id } });
  return { ok: true, itemId: item.id, endsAt };
}

/** Starts the next item in the running order. */
export async function startNextItem(params: { auction: AuctionRef; seconds?: unknown; now?: Date }): Promise<LiveResult> {
  const next = await prisma.auctionItem.findFirst({ where: { auctionId: params.auction.id, churchId: params.auction.churchId, status: "UPCOMING" }, orderBy: [{ sortOrder: "asc" }, { itemNumber: "asc" }] });
  if (!next) return { ok: false, error: "No items are left to run." };
  return startItem({ auction: params.auction, itemId: next.id, seconds: params.seconds, now: params.now });
}

/** Ends bidding on the item on the block now: sold to the high bidder, or passed if nobody bid. */
export async function closeItemNow(params: { auction: AuctionRef; itemId: string; now?: Date }): Promise<LiveResult> {
  const now = params.now ?? new Date();
  const { auction, itemId } = params;
  const item = await prisma.auctionItem.findFirst({ where: { id: itemId, auctionId: auction.id, churchId: auction.churchId } });
  if (!item) return { ok: false, error: "Item not found." };
  if (item.status !== "OPEN") return { ok: false, error: "That item isn't open for bidding." };
  await prisma.auctionItem.updateMany({ where: { id: item.id, status: "OPEN", endsAt: { gt: now } }, data: { endsAt: now } });
  const outcome = await settleAuction(auction.id, now);
  return { ok: true, itemId: item.id, outcome };
}

/** Sets the running order. Only items that have not run can move, and every id must belong to this auction. */
export async function reorderItems(params: { auction: AuctionRef; itemIds: string[] }): Promise<{ ok: true } | { ok: false; error: string }> {
  const { auction, itemIds } = params;
  if (!Array.isArray(itemIds) || itemIds.length === 0 || new Set(itemIds).size !== itemIds.length) return { ok: false, error: "Send each item once." };
  const items = await prisma.auctionItem.findMany({ where: { auctionId: auction.id, churchId: auction.churchId, id: { in: itemIds } }, select: { id: true, status: true } });
  if (items.length !== itemIds.length) return { ok: false, error: "One of those items isn't in this auction." };
  if (items.some((i) => i.status !== "OPEN" && i.status !== "UPCOMING")) return { ok: false, error: "Only items that haven't run can be moved." };
  await prisma.$transaction(itemIds.map((id, index) => prisma.auctionItem.update({ where: { id }, data: { sortOrder: index + 1 } })));
  return { ok: true };
}
