import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { checkBid, extendedEndsAt, type BidRejection } from "./bidRules";
import { sendOutbidEmail } from "./auctionEmails";

/**
 * Accepts one bid, or says exactly why not. This is the only code that writes a bid.
 *
 * Why this is safe when many people bid at once: the item row carries the current high bid. A bid is accepted by an
 * atomic compare-and-set on that row ("set the bid to X only if the high bid is still the one I read"), in the
 * same transaction that writes the bid row. If someone else got in first the update touches nothing, we re-read and
 * decide again against the new high bid. The bid table's unique key on (item, amount) is the last backstop: two
 * bids of exactly the same amount can never both exist.
 *
 * No external HTTP happens inside the transaction. The "you've been outbid" email goes out after it commits.
 */

export type PlaceBidResult =
  | { ok: true; itemId: string; currentBidCents: number; endsAt: Date; extended: boolean; outbidBidderId: string | null }
  | { ok: false; reason: BidRejection | "NOT_FOUND" | "BIDDER_NOT_ALLOWED" | "BUSY"; minimumCents?: number };

const MAX_ATTEMPTS = 4;

export interface PlaceBidParams {
  auctionId: string;
  itemId: string;
  bidderId: string;
  amountCents: number;
  source: "ONLINE" | "ROOM";
  enteredByUserId?: string | null;
  now?: Date;
}

export async function placeBid(params: PlaceBidParams): Promise<PlaceBidResult> {
  const now = params.now ?? new Date();
  const { auctionId, itemId, bidderId, amountCents, source } = params;

  const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
  if (!auction) return { ok: false, reason: "NOT_FOUND" };

  // Only approved bidders of THIS auction (and this organization) may bid.
  const bidder = await prisma.auctionBidder.findFirst({ where: { id: bidderId, auctionId, churchId: auction.churchId } });
  if (!bidder || bidder.status !== "APPROVED") return { ok: false, reason: "BIDDER_NOT_ALLOWED" };

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const item = await prisma.auctionItem.findFirst({ where: { id: itemId, auctionId, churchId: auction.churchId } });
    if (!item) return { ok: false, reason: "NOT_FOUND" };

    const check = checkBid({ auction, item, bidderId, amountCents, now });
    if (!check.ok) return { ok: false, reason: check.reason, minimumCents: check.minimumCents };

    // A live-room item only runs a minute or two, so its extension is in seconds: a bid in the last 30 seconds adds 30.
    const newEndsAt = extendedEndsAt({
      itemEndsAt: item.endsAt, now, windowMinutes: auction.autoExtendWindowMinutes, extendMinutes: auction.autoExtendMinutes,
      ...(auction.format === "LIVE" ? { windowSeconds: 30, extendSeconds: 30 } : {}),
    });

    try {
      const accepted = await prisma.$transaction(async (tx) => {
        // Compare-and-set: only moves the item if nobody bid since we read it and it is still open.
        const moved = await tx.auctionItem.updateMany({
          where: { id: item.id, status: "OPEN", endsAt: { gt: now }, currentBidCents: item.currentBidCents, highBidderId: item.highBidderId },
          data: { currentBidCents: amountCents, highBidderId: bidderId, bidCount: { increment: 1 }, ...(newEndsAt ? { endsAt: newEndsAt } : {}) },
        });
        if (moved.count === 0) return false;
        await tx.auctionBid.create({
          data: { churchId: auction.churchId, auctionId, itemId: item.id, bidderId, amountCents, source, enteredByUserId: params.enteredByUserId ?? null },
        });
        return true;
      });

      if (!accepted) continue; // lost the race: re-read and decide again against the new high bid

      const outbidBidderId = item.highBidderId && item.highBidderId !== bidderId ? item.highBidderId : null;
      if (outbidBidderId) {
        // After the commit, best effort. A failed email never affects the bid.
        void notifyOutbid({ auction, outbidBidderId, itemTitle: item.title, newBidCents: amountCents });
      }
      return { ok: true, itemId: item.id, currentBidCents: amountCents, endsAt: newEndsAt ?? item.endsAt, extended: Boolean(newEndsAt), outbidBidderId };
    } catch (err) {
      // Another bid of exactly this amount got in first: the database refused the duplicate. Decide again.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
  }
  return { ok: false, reason: "BUSY" };
}

async function notifyOutbid(params: { auction: { id: string; churchId: string; title: string; slug: string }; outbidBidderId: string; itemTitle: string; newBidCents: number }) {
  try {
    const previous = await prisma.auctionBidder.findUnique({ where: { id: params.outbidBidderId } });
    if (!previous) return;
    await sendOutbidEmail({
      churchId: params.auction.churchId,
      auctionId: params.auction.id,
      auctionTitle: params.auction.title,
      slug: params.auction.slug,
      to: previous.email,
      recipientName: previous.name,
      itemTitle: params.itemTitle,
      newBidCents: params.newBidCents,
    });
  } catch (err) {
    console.error("Outbid notification failed (non-fatal):", err);
  }
}
