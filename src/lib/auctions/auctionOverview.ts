import { prisma } from "@/lib/prisma";

/**
 * The numbers an organization wants after an auction: who registered, who actually bid, what sold and for how much,
 * and what has been paid. Read straight from the bids, wins and invoices, so it is right at any moment, not only
 * at the end. Shown on the Results tab and emailed once when the auction settles.
 */

export interface AuctionOverview {
  registered: number;
  approved: number;
  waitingForApproval: number;
  declinedOrBlocked: number;
  /** People who placed at least one bid. */
  participated: number;
  /** People who won at least one item. */
  winners: number;
  totalBids: number;
  onlineBids: number;
  roomBids: number;
  itemsTotal: number;
  itemsSold: number;
  itemsUnsold: number;
  itemsWithdrawn: number;
  /** Everything won and still owed or paid (not counting wins nobody paid for in the end). */
  raisedCents: number;
  paidCents: number;
  outstandingCents: number;
  /** Wins that were never paid and had nobody next in line. */
  notPaidCents: number;
  goalCents: number | null;
  goalPercent: number | null;
  averageSaleCents: number | null;
  /** What the sold items were worth, and how much more than that was paid (the gift part). */
  fairMarketValueSoldCents: number;
  aboveValueCents: number;
  topItems: { itemNumber: number; title: string; amountCents: number; bidCount: number }[];
  mostContested: { itemNumber: number; title: string; bidCount: number }[];
}

export async function buildAuctionOverview(auctionId: string, churchId: string): Promise<AuctionOverview> {
  const [auction, bidders, bids, items, wins] = await Promise.all([
    prisma.auction.findFirst({ where: { id: auctionId, churchId }, select: { goalCents: true } }),
    prisma.auctionBidder.findMany({ where: { auctionId, churchId }, select: { status: true } }),
    prisma.auctionBid.findMany({ where: { auctionId, churchId }, select: { bidderId: true, source: true } }),
    prisma.auctionItem.findMany({ where: { auctionId, churchId }, select: { id: true, itemNumber: true, title: true, status: true, bidCount: true, fairMarketValueCents: true } }),
    prisma.auctionWin.findMany({ where: { auctionId, churchId }, select: { itemId: true, bidderId: true, amountCents: true, status: true } }),
  ]);

  const kept = wins.filter((w) => w.status !== "FORFEITED");
  const raisedCents = kept.reduce((sum, w) => sum + w.amountCents, 0);
  const paidCents = wins.filter((w) => w.status === "PAID").reduce((sum, w) => sum + w.amountCents, 0);
  const itemById = new Map(items.map((i) => [i.id, i]));
  const fairMarketValueSoldCents = kept.reduce((sum, w) => sum + Math.min(itemById.get(w.itemId)?.fairMarketValueCents ?? 0, w.amountCents), 0);
  const goalCents = auction?.goalCents ?? null;

  return {
    registered: bidders.length,
    approved: bidders.filter((b) => b.status === "APPROVED").length,
    waitingForApproval: bidders.filter((b) => b.status === "PENDING").length,
    declinedOrBlocked: bidders.filter((b) => b.status === "DECLINED" || b.status === "BLOCKED").length,
    participated: new Set(bids.map((b) => b.bidderId)).size,
    winners: new Set(kept.map((w) => w.bidderId)).size,
    totalBids: bids.length,
    onlineBids: bids.filter((b) => b.source === "ONLINE").length,
    roomBids: bids.filter((b) => b.source === "ROOM").length,
    itemsTotal: items.filter((i) => i.status !== "WITHDRAWN").length,
    itemsSold: items.filter((i) => i.status === "SOLD").length,
    itemsUnsold: items.filter((i) => i.status === "UNSOLD").length,
    itemsWithdrawn: items.filter((i) => i.status === "WITHDRAWN").length,
    raisedCents,
    paidCents,
    outstandingCents: kept.filter((w) => w.status === "PENDING_PAYMENT").reduce((sum, w) => sum + w.amountCents, 0),
    notPaidCents: wins.filter((w) => w.status === "FORFEITED").reduce((sum, w) => sum + w.amountCents, 0),
    goalCents,
    goalPercent: goalCents ? Math.round((raisedCents / goalCents) * 100) : null,
    averageSaleCents: kept.length > 0 ? Math.round(raisedCents / kept.length) : null,
    fairMarketValueSoldCents,
    aboveValueCents: raisedCents - fairMarketValueSoldCents,
    topItems: kept
      .map((w) => ({ itemNumber: itemById.get(w.itemId)?.itemNumber ?? 0, title: itemById.get(w.itemId)?.title ?? "", amountCents: w.amountCents, bidCount: itemById.get(w.itemId)?.bidCount ?? 0 }))
      .sort((a, b) => b.amountCents - a.amountCents)
      .slice(0, 5),
    mostContested: items
      .filter((i) => i.bidCount > 0)
      .map((i) => ({ itemNumber: i.itemNumber, title: i.title, bidCount: i.bidCount }))
      .sort((a, b) => b.bidCount - a.bidCount)
      .slice(0, 3),
  };
}
