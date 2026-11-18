import { NextResponse } from "next/server";
import { validationError } from "@/lib/utils/validationError";
import { auctionNotFound, guardAuctionsRoute, loadOwnedAuction } from "@/lib/auctions/merchantGuard";
import { closeItemNow, startItem, startNextItem } from "@/lib/auctions/liveSequence";

/** The live-room controls: put an item on the block, go to the next one, or sell/pass the one that is open. */
export async function POST(req: Request, { params }: { params: Promise<{ auctionId: string }> }) {
  const guard = await guardAuctionsRoute("canManageEvents");
  if ("response" in guard) return guard.response;
  const { auth } = guard;
  const { auctionId } = await params;
  const auction = await loadOwnedAuction(auth, auctionId);
  if (!auction) return auctionNotFound();

  const body = await req.json().catch(() => ({}));
  const itemId = typeof body.itemId === "string" ? body.itemId : "";
  const result =
    body.action === "start" && itemId ? await startItem({ auction, itemId, seconds: body.seconds })
    : body.action === "next" ? await startNextItem({ auction, seconds: body.seconds })
    : body.action === "close" && itemId ? await closeItemNow({ auction, itemId })
    : null;
  if (!result) return validationError("Choose start, next or close.");
  if (!result.ok) return validationError(result.error, 409);
  return NextResponse.json({ success: true, itemId: result.itemId, endsAt: result.endsAt?.toISOString() ?? null });
}
