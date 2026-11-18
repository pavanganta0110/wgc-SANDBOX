import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validationError } from "@/lib/utils/validationError";
import { auctionNotFound, guardAuctionsRoute, loadOwnedAuction } from "@/lib/auctions/merchantGuard";
import { validateItemInput } from "@/lib/auctions/auctionConfig";

type Ctx = { params: Promise<{ auctionId: string; itemId: string }> };

/** Edits an item. Once it has a bid the money fields are fixed, so nobody's bid changes meaning under them. */
export async function PATCH(req: Request, { params }: Ctx) {
  const guard = await guardAuctionsRoute("canManageEvents");
  if ("response" in guard) return guard.response;
  const { auth } = guard;
  const { auctionId, itemId } = await params;
  const auction = await loadOwnedAuction(auth, auctionId);
  if (!auction) return auctionNotFound();
  const item = await prisma.auctionItem.findFirst({ where: { id: itemId, auctionId, churchId: auth.churchId } });
  if (!item) return NextResponse.json({ error: "Item not found." }, { status: 404 });
  // An item still waiting its turn in a live auction (UPCOMING) can be edited like an open one.
  if (item.status !== "OPEN" && item.status !== "UPCOMING") return validationError("This item is closed and can't be edited.", 409);

  const parsed = validateItemInput({ ...item, ...(await req.json().catch(() => ({}))) });
  if (!parsed.ok) return validationError(parsed.error);
  const v = parsed.value;
  const moneyChanged = v.startingBidCents !== item.startingBidCents || v.minIncrementCents !== item.minIncrementCents;
  if (item.bidCount > 0 && moneyChanged) return validationError("This item already has bids, so its starting bid and minimum raise can't change.", 409);

  await prisma.auctionItem.update({ where: { id: item.id }, data: v });
  return NextResponse.json({ success: true });
}

/** Removes an item with no bids; one with bids is withdrawn instead (kept for the record, hidden from the public). */
export async function DELETE(_req: Request, { params }: Ctx) {
  const guard = await guardAuctionsRoute("canManageEvents");
  if ("response" in guard) return guard.response;
  const { auth } = guard;
  const { auctionId, itemId } = await params;
  const auction = await loadOwnedAuction(auth, auctionId);
  if (!auction) return auctionNotFound();
  const item = await prisma.auctionItem.findFirst({ where: { id: itemId, auctionId, churchId: auth.churchId } });
  if (!item) return NextResponse.json({ error: "Item not found." }, { status: 404 });

  const notRunYet = item.status === "OPEN" || item.status === "UPCOMING";
  if (item.bidCount === 0 && notRunYet) {
    await prisma.auctionItem.delete({ where: { id: item.id } });
    return NextResponse.json({ success: true, removed: true });
  }
  if (!notRunYet) return validationError("A closed item can't be withdrawn.", 409);
  await prisma.auctionItem.update({ where: { id: item.id }, data: { status: "WITHDRAWN", closedAt: new Date() } });
  return NextResponse.json({ success: true, removed: false });
}
