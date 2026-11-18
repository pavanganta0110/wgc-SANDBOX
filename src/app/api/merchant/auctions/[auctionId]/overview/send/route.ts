import { NextResponse } from "next/server";
import { validationError } from "@/lib/utils/validationError";
import { auctionNotFound, guardAuctionsRoute, loadOwnedAuction } from "@/lib/auctions/merchantGuard";
import { buildAuctionOverview } from "@/lib/auctions/auctionOverview";
import { sendOverviewEmail } from "@/lib/auctions/auctionEmails";

/** Emails the results summary to the person signed in, as it stands right now. */
export async function POST(_req: Request, { params }: { params: Promise<{ auctionId: string }> }) {
  const guard = await guardAuctionsRoute("canViewEvents");
  if ("response" in guard) return guard.response;
  const { auth } = guard;
  const { auctionId } = await params;
  const auction = await loadOwnedAuction(auth, auctionId);
  if (!auction) return auctionNotFound();
  const overview = await buildAuctionOverview(auction.id, auth.churchId);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://wgcpayments.com";
  const sent = await sendOverviewEmail({ churchId: auth.churchId, auctionId: auction.id, auctionTitle: auction.title, to: auth.email, overview, manageUrl: `${appUrl}/merchant/auctions/${auction.id}` });
  if (!sent) return validationError("The summary could not be sent. Please try again.", 502);
  return NextResponse.json({ success: true, sentTo: auth.email });
}
