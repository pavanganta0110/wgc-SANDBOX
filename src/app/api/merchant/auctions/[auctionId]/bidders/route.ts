import { NextResponse } from "next/server";
import { validationError } from "@/lib/utils/validationError";
import { auctionNotFound, guardAuctionsRoute, loadOwnedAuction } from "@/lib/auctions/merchantGuard";
import { addBidderByStaff } from "@/lib/auctions/registration";

/** Staff add a bidder at the event. They are approved at once and get their number. */
export async function POST(req: Request, { params }: { params: Promise<{ auctionId: string }> }) {
  const guard = await guardAuctionsRoute("canManageEvents");
  if ("response" in guard) return guard.response;
  const { auth } = guard;
  const { auctionId } = await params;
  const auction = await loadOwnedAuction(auth, auctionId);
  if (!auction) return auctionNotFound();
  if (auction.status === "SETTLED") return validationError("This auction is finished.", 409);
  const body = await req.json().catch(() => ({}));
  const result = await addBidderByStaff({ auction, name: body.name, email: body.email, phone: body.phone, userId: auth.userId });
  if (!result.ok) return validationError(result.error);
  return NextResponse.json({ id: result.bidderId, bidderNumber: result.bidderNumber }, { status: 201 });
}
