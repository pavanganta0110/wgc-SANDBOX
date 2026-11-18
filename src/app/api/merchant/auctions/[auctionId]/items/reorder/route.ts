import { NextResponse } from "next/server";
import { validationError } from "@/lib/utils/validationError";
import { auctionNotFound, guardAuctionsRoute, loadOwnedAuction } from "@/lib/auctions/merchantGuard";
import { reorderItems } from "@/lib/auctions/liveSequence";

/** Sets the running order of the items that have not run yet (the order they come up in a live auction, and the order they are listed). */
export async function POST(req: Request, { params }: { params: Promise<{ auctionId: string }> }) {
  const guard = await guardAuctionsRoute("canManageEvents");
  if ("response" in guard) return guard.response;
  const { auth } = guard;
  const { auctionId } = await params;
  const auction = await loadOwnedAuction(auth, auctionId);
  if (!auction) return auctionNotFound();
  const body = await req.json().catch(() => ({}));
  const result = await reorderItems({ auction, itemIds: body.itemIds });
  if (!result.ok) return validationError(result.error);
  return NextResponse.json({ success: true });
}
