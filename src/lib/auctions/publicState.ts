import { prisma } from "@/lib/prisma";
import { minimumNextBidCents } from "./bidRules";

/**
 * What the public auction page and the live wall show. Never a bidder's name or email: a bidder is only ever
 * "Bidder 142". The signed-in bidder additionally learns which items they lead.
 */

export interface PublicAuctionState {
  serverNow: string;
  auction: {
    slug: string;
    title: string;
    description: string | null;
    coverImageUrl: string | null;
    status: string;
    format: string;
    startsAt: string;
    endsAt: string;
    registrationMode: string;
    goalCents: number | null;
  };
  items: {
    id: string;
    itemNumber: number;
    title: string;
    description: string | null;
    imageUrl: string | null;
    status: string;
    startingBidCents: number;
    minimumNextBidCents: number;
    currentBidCents: number | null;
    highBidderNumber: number | null;
    bidCount: number;
    endsAt: string;
    youAreHighBidder: boolean;
  }[];
  recentBids: { itemNumber: number; bidderNumber: number | null; amountCents: number; at: string }[];
  totalRaisedCents: number;
  me: { status: string; bidderNumber: number | null; name: string } | null;
}

export async function loadPublicAuctionState(auction: { id: string; churchId: string }, meBidderId: string | null): Promise<PublicAuctionState | null> {
  const row = await prisma.auction.findFirst({ where: { id: auction.id, churchId: auction.churchId, status: { not: "DRAFT" } } });
  if (!row) return null;
  const [items, bidders, bids, me] = await Promise.all([
    prisma.auctionItem.findMany({ where: { auctionId: row.id }, orderBy: [{ sortOrder: "asc" }, { itemNumber: "asc" }] }),
    prisma.auctionBidder.findMany({ where: { auctionId: row.id, status: "APPROVED" }, select: { id: true, bidderNumber: true } }),
    prisma.auctionBid.findMany({ where: { auctionId: row.id }, orderBy: { createdAt: "desc" }, take: 15 }),
    meBidderId ? prisma.auctionBidder.findUnique({ where: { id: meBidderId } }) : Promise.resolve(null),
  ]);
  const numberById = new Map(bidders.map((b) => [b.id, b.bidderNumber]));
  const itemNumberById = new Map(items.map((i) => [i.id, i.itemNumber]));

  const totalRaisedCents = items.reduce((sum, i) => sum + (i.status === "SOLD" ? i.winningBidCents ?? 0 : i.status === "OPEN" ? i.currentBidCents ?? 0 : 0), 0);

  return {
    serverNow: new Date().toISOString(),
    auction: {
      slug: row.slug,
      title: row.title,
      description: row.description,
      coverImageUrl: row.coverImageUrl,
      status: row.status,
      format: row.format,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      registrationMode: row.registrationMode,
      goalCents: row.goalCents,
    },
    items: items
      .filter((i) => i.status !== "WITHDRAWN")
      .map((i) => ({
        id: i.id,
        itemNumber: i.itemNumber,
        title: i.title,
        description: i.description,
        imageUrl: i.imageUrl,
        status: i.status,
        startingBidCents: i.startingBidCents,
        minimumNextBidCents: minimumNextBidCents(i),
        currentBidCents: i.currentBidCents,
        highBidderNumber: i.highBidderId ? numberById.get(i.highBidderId) ?? null : null,
        bidCount: i.bidCount,
        endsAt: i.endsAt.toISOString(),
        youAreHighBidder: Boolean(meBidderId && i.highBidderId === meBidderId),
      })),
    recentBids: bids.map((b) => ({ itemNumber: itemNumberById.get(b.itemId) ?? 0, bidderNumber: numberById.get(b.bidderId) ?? null, amountCents: b.amountCents, at: b.createdAt.toISOString() })),
    totalRaisedCents,
    me: me ? { status: me.status, bidderNumber: me.bidderNumber, name: me.name } : null,
  };
}
