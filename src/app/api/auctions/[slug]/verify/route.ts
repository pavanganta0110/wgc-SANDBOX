import { NextResponse } from "next/server";
import { loadPublicAuction } from "../_load";
import { verifyBidderCode } from "@/lib/auctions/registration";
import { buildBidderCookie } from "@/lib/auctions/bidderIdentity";

/** Step 2: the code from the email. On success the bidder is signed in for this auction (httpOnly cookie). */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const auction = await loadPublicAuction(slug);
  if (!auction) return NextResponse.json({ error: "Auction not found." }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const result = await verifyBidderCode({ auction, email: body.email, code: body.code });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const res = NextResponse.json({ success: true, status: result.status, bidderNumber: result.bidderNumber });
  res.headers.append("Set-Cookie", buildBidderCookie(auction.id, result.bidderId, result.sessionToken));
  res.headers.set("Cache-Control", "no-store");
  return res;
}
