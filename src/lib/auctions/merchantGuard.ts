import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardEventsRoute } from "@/lib/eventRegistration/merchantGuard";
import type { MerchantAuthContext } from "@/lib/auth/requireMerchantSession";

/** Auctions are run by the same people who run events, so they share the events permissions. */
export const guardAuctionsRoute = guardEventsRoute;

/** An auction, only if it belongs to this organization. A foreign or unknown id looks the same (404). */
export async function loadOwnedAuction(auth: MerchantAuthContext, auctionId: string) {
  return prisma.auction.findFirst({ where: { id: auctionId, churchId: auth.churchId } });
}

export const auctionNotFound = () => NextResponse.json({ error: "Auction not found." }, { status: 404 });
