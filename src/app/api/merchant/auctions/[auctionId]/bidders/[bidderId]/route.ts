import { NextResponse } from "next/server";
import { validationError } from "@/lib/utils/validationError";
import { auctionNotFound, guardAuctionsRoute, loadOwnedAuction } from "@/lib/auctions/merchantGuard";
import { approveBidder, blockBidder, declineBidder } from "@/lib/auctions/registration";

/** Approve, decline or block a bidder. Approving and declining email them. */
export async function POST(req: Request, { params }: { params: Promise<{ auctionId: string; bidderId: string }> }) {
  const guard = await guardAuctionsRoute("canManageEvents");
  if ("response" in guard) return guard.response;
  const { auth } = guard;
  const { auctionId, bidderId } = await params;
  const auction = await loadOwnedAuction(auth, auctionId);
  if (!auction) return auctionNotFound();
  const { action } = await req.json().catch(() => ({ action: "" }));

  try {
    if (action === "approve") return NextResponse.json({ success: true, bidderNumber: await approveBidder({ auction, bidderId, sendEmail: true }) });
    if (action === "decline") await declineBidder({ auction, bidderId, sendEmail: true });
    else if (action === "block") await blockBidder({ auction, bidderId });
    else return validationError("Choose approve, decline or block.");
  } catch {
    return NextResponse.json({ error: "Bidder not found." }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
