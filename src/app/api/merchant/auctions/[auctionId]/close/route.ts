import { NextResponse } from "next/server";
import { validationError } from "@/lib/utils/validationError";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { auctionNotFound, guardAuctionsRoute, loadOwnedAuction } from "@/lib/auctions/merchantGuard";
import { closeAuctionNow, settleAuction } from "@/lib/auctions/settleAuction";

/** Ends bidding now and sends every winner their invoice. Also re-runs settlement for an auction whose time is already up. */
export async function POST(req: Request, { params }: { params: Promise<{ auctionId: string }> }) {
  const guard = await guardAuctionsRoute("canManageEvents");
  if ("response" in guard) return guard.response;
  const { auth } = guard;
  const { auctionId } = await params;
  const auction = await loadOwnedAuction(auth, auctionId);
  if (!auction) return auctionNotFound();
  if (auction.status === "DRAFT") return validationError("Publish the auction before closing it.", 409);

  const outcome = auction.status === "SETTLED" ? await settleAuction(auction.id) : await closeAuctionNow(auction.id, auth.churchId);
  await logDashboardAction({ churchId: auth.churchId, actorUserId: auth.userId, actorEmail: auth.email, actorRole: auth.rawRole, action: "auction.closed", entityType: "auction", entityId: auction.id, metadata: { ...outcome }, req });
  return NextResponse.json({ success: true, ...outcome });
}
