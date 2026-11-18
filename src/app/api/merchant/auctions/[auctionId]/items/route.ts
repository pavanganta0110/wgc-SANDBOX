import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { validationError } from "@/lib/utils/validationError";
import { auctionNotFound, guardAuctionsRoute, loadOwnedAuction } from "@/lib/auctions/merchantGuard";
import { validateItemInput } from "@/lib/auctions/auctionConfig";

export async function POST(req: Request, { params }: { params: Promise<{ auctionId: string }> }) {
  const guard = await guardAuctionsRoute("canManageEvents");
  if ("response" in guard) return guard.response;
  const { auth } = guard;
  const { auctionId } = await params;
  const auction = await loadOwnedAuction(auth, auctionId);
  if (!auction) return auctionNotFound();
  if (auction.status === "SETTLED") return validationError("This auction is finished.", 409);

  const parsed = validateItemInput(await req.json().catch(() => ({})));
  if (!parsed.ok) return validationError(parsed.error);

  // The next item number; two added at once can't share one (the unique key decides, the loser tries again).
  for (let attempt = 0; attempt < 5; attempt++) {
    const top = await prisma.auctionItem.aggregate({ where: { auctionId }, _max: { itemNumber: true } });
    const itemNumber = (top._max.itemNumber ?? 0) + 1;
    try {
      // A live auction's items wait their turn on the block; a silent auction's items are all open for bidding.
      const item = await prisma.auctionItem.create({ data: { ...parsed.value, churchId: auth.churchId, auctionId, itemNumber, sortOrder: itemNumber, endsAt: auction.endsAt, status: auction.format === "LIVE" ? "UPCOMING" : "OPEN" } });
      return NextResponse.json({ id: item.id, itemNumber }, { status: 201 });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
  }
  return validationError("Could not add the item. Please try again.", 409);
}
