import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validationError } from "@/lib/utils/validationError";
import { auctionNotFound, guardAuctionsRoute, loadOwnedAuction } from "@/lib/auctions/merchantGuard";
import { placeBid } from "@/lib/auctions/placeBid";
import { formatCents } from "@/lib/auctions/bidRules";

/**
 * Live-room control: staff type the bidder number and amount the auctioneer called. It goes through the same bid
 * rules and the same bid list as an online bid, so the highest bid wins wherever it came from.
 */
export async function POST(req: Request, { params }: { params: Promise<{ auctionId: string }> }) {
  const guard = await guardAuctionsRoute("canManageEvents");
  if ("response" in guard) return guard.response;
  const { auth } = guard;
  const { auctionId } = await params;
  const auction = await loadOwnedAuction(auth, auctionId);
  if (!auction) return auctionNotFound();

  const body = await req.json().catch(() => ({}));
  const bidderNumber = Number(body.bidderNumber);
  if (!Number.isInteger(bidderNumber) || typeof body.itemId !== "string") return validationError("Enter the bidder number and choose the item.");
  const bidder = await prisma.auctionBidder.findFirst({ where: { auctionId, churchId: auth.churchId, bidderNumber, status: "APPROVED" } });
  if (!bidder) return validationError(`No approved bidder has number ${bidderNumber}.`, 404);

  const result = await placeBid({ auctionId, itemId: body.itemId, bidderId: bidder.id, amountCents: Number(body.amountCents), source: "ROOM", enteredByUserId: auth.userId });
  if (!result.ok) {
    const message = result.reason === "TOO_LOW" ? `The next bid must be at least ${formatCents(result.minimumCents ?? 0)}.` : result.reason === "ITEM_NOT_STARTED" ? "That item isn't on the block yet. Start it first." : result.reason === "ALREADY_HIGH_BIDDER" ? `Bidder ${bidderNumber} already has the highest bid.` : `Bid not accepted (${result.reason.toLowerCase().replace(/_/g, " ")}).`;
    return validationError(message, 409);
  }
  return NextResponse.json({ success: true, currentBidCents: result.currentBidCents, bidderNumber });
}
