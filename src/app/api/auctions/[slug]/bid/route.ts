import { NextResponse } from "next/server";
import { loadPublicAuction } from "../_load";
import { resolveBidderSession } from "@/lib/auctions/registration";
import { placeBid } from "@/lib/auctions/placeBid";
import { formatCents } from "@/lib/auctions/bidRules";

const MESSAGES: Record<string, string> = {
  AUCTION_NOT_OPEN: "This auction isn't open for bidding right now.",
  ITEM_CLOSED: "Bidding on this item has closed.",
  BAD_AMOUNT: "Enter a whole-dollar amount.",
  ALREADY_HIGH_BIDDER: "You already have the highest bid.",
  BIDDER_NOT_ALLOWED: "You're not approved to bid in this auction yet.",
  NOT_FOUND: "That item wasn't found.",
  BUSY: "Lots of bids at once. Please try again.",
};

/** Places a bid as the signed-in bidder. The bidder is always the one in the cookie, never one named in the request. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const auction = await loadPublicAuction(slug);
  if (!auction) return NextResponse.json({ error: "Auction not found." }, { status: 404 });
  const bidder = await resolveBidderSession(req.headers.get("cookie"), auction);
  if (!bidder) return NextResponse.json({ error: "Sign in to bid.", code: "SIGN_IN" }, { status: 401 });

  // The cookie also works inside a website frame (SameSite=None), so only a real JSON request may bid: a hostile
  // page's form post cannot be application/json without the browser first asking this server's permission.
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "Unsupported request." }, { status: 415 });
  }
  const body = await req.json().catch(() => ({}));
  if (typeof body.itemId !== "string") return NextResponse.json({ error: MESSAGES.NOT_FOUND }, { status: 400 });
  const result = await placeBid({ auctionId: auction.id, itemId: body.itemId, bidderId: bidder.id, amountCents: Number(body.amountCents), source: "ONLINE" });

  if (!result.ok) {
    const message = result.reason === "TOO_LOW" ? `The next bid must be at least ${formatCents(result.minimumCents ?? 0)}.` : MESSAGES[result.reason] ?? "Your bid wasn't accepted.";
    return NextResponse.json({ error: message, code: result.reason, minimumCents: result.minimumCents }, { status: result.reason === "BUSY" ? 503 : 409 });
  }
  return NextResponse.json({ success: true, currentBidCents: result.currentBidCents, endsAt: result.endsAt.toISOString(), extended: result.extended });
}
