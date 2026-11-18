import { NextResponse } from "next/server";
import { loadPublicAuction } from "../_load";
import { loadPublicAuctionState } from "@/lib/auctions/publicState";
import { resolveBidderSession } from "@/lib/auctions/registration";
import { settleAuction } from "@/lib/auctions/settleAuction";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Everything the auction page and the live wall poll for. Public; never exposes a bidder's name or email. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const auction = await loadPublicAuction(slug);
  if (!auction) return NextResponse.json({ error: "Auction not found." }, { status: 404 });

  // The daily sweep is the backstop. Here, the first visit after an item's time is up closes it, so results do
  // not wait for a schedule. Safe to run from anywhere: it is idempotent and only does work for items that are due.
  if (auction.status === "OPEN") {
    const due = await prisma.auctionItem.count({ where: { auctionId: auction.id, status: "OPEN", endsAt: { lte: new Date() } } });
    if (due > 0) await settleAuction(auction.id).catch((err) => console.error("Settling on view failed (non-fatal):", err));
  }

  const me = await resolveBidderSession(req.headers.get("cookie"), auction);
  const state = await loadPublicAuctionState(auction, me?.id ?? null);
  if (!state) return NextResponse.json({ error: "Auction not found." }, { status: 404 });
  return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
}
