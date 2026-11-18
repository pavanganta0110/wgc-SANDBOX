import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validationError } from "@/lib/utils/validationError";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { auctionNotFound, guardAuctionsRoute, loadOwnedAuction } from "@/lib/auctions/merchantGuard";
import { publicAuctionUrl } from "@/lib/auctions/auctionEmails";

/** Makes a draft auction public. It opens for bidding at its start time. */
export async function POST(req: Request, { params }: { params: Promise<{ auctionId: string }> }) {
  const guard = await guardAuctionsRoute("canManageEvents");
  if ("response" in guard) return guard.response;
  const { auth } = guard;
  const { auctionId } = await params;
  const auction = await loadOwnedAuction(auth, auctionId);
  if (!auction) return auctionNotFound();
  if (auction.status !== "DRAFT") return validationError("This auction is already public.", 409);
  if (auction.endsAt <= new Date()) return validationError("Set a closing time in the future before publishing.");
  const items = await prisma.auctionItem.count({ where: { auctionId, status: { in: ["OPEN", "UPCOMING"] } } });
  if (items === 0) return validationError("Add at least one item before publishing.");

  await prisma.auction.update({ where: { id: auction.id }, data: { status: "OPEN" } });
  await logDashboardAction({ churchId: auth.churchId, actorUserId: auth.userId, actorEmail: auth.email, actorRole: auth.rawRole, action: "auction.published", entityType: "auction", entityId: auction.id, req });
  return NextResponse.json({ success: true, publicUrl: publicAuctionUrl(auction.slug) });
}
