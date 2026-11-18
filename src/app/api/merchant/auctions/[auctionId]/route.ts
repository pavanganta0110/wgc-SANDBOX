import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validationError } from "@/lib/utils/validationError";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { auctionNotFound, guardAuctionsRoute, loadOwnedAuction } from "@/lib/auctions/merchantGuard";
import { validateAuctionInput } from "@/lib/auctions/auctionConfig";
import { liveWallUrl, publicAuctionUrl } from "@/lib/auctions/auctionEmails";
import { syncPaidWins } from "@/lib/auctions/settleAuction";

/** The whole auction for the organization's screen: items, bidders, and every win with its payment status. */
export async function GET(_req: Request, { params }: { params: Promise<{ auctionId: string }> }) {
  const guard = await guardAuctionsRoute("canViewEvents");
  if ("response" in guard) return guard.response;
  const { auth } = guard;
  const { auctionId } = await params;
  const auction = await loadOwnedAuction(auth, auctionId);
  if (!auction) return auctionNotFound();

  await syncPaidWins(auction.id).catch(() => undefined);
  const [items, bidders, wins] = await Promise.all([
    prisma.auctionItem.findMany({ where: { auctionId, churchId: auth.churchId }, orderBy: [{ sortOrder: "asc" }, { itemNumber: "asc" }] }),
    prisma.auctionBidder.findMany({ where: { auctionId, churchId: auth.churchId }, orderBy: { createdAt: "asc" } }),
    prisma.auctionWin.findMany({ where: { auctionId, churchId: auth.churchId }, orderBy: { createdAt: "asc" } }),
  ]);
  const invoices = await prisma.invoice.findMany({ where: { id: { in: wins.map((w) => w.invoiceId).filter((id): id is string => !!id) }, churchId: auth.churchId }, select: { id: true, status: true, invoiceNumber: true } });
  const invoiceById = new Map(invoices.map((i) => [i.id, i]));
  const bidderById = new Map(bidders.map((b) => [b.id, b]));
  const itemById = new Map(items.map((i) => [i.id, i]));

  return NextResponse.json({
    auction: { ...auction, startsAt: auction.startsAt.toISOString(), endsAt: auction.endsAt.toISOString(), publicUrl: publicAuctionUrl(auction.slug), wallUrl: liveWallUrl(auction.slug) },
    items: items.map((i) => ({ ...i, endsAt: i.endsAt.toISOString(), closedAt: i.closedAt?.toISOString() ?? null, highBidderNumber: i.highBidderId ? bidderById.get(i.highBidderId)?.bidderNumber ?? null : null })),
    bidders: bidders.map((b) => ({ id: b.id, name: b.name, email: b.email, phone: b.phone, status: b.status, bidderNumber: b.bidderNumber, verified: Boolean(b.emailVerifiedAt), createdAt: b.createdAt.toISOString() })),
    wins: wins.map((w) => ({
      id: w.id, itemNumber: itemById.get(w.itemId)?.itemNumber ?? null, itemTitle: itemById.get(w.itemId)?.title ?? "", amountCents: w.amountCents, status: w.status,
      bidderName: bidderById.get(w.bidderId)?.name ?? "", bidderNumber: bidderById.get(w.bidderId)?.bidderNumber ?? null, bidderEmail: bidderById.get(w.bidderId)?.email ?? "",
      invoiceNumber: w.invoiceId ? invoiceById.get(w.invoiceId)?.invoiceNumber ?? null : null, invoiceStatus: w.invoiceId ? invoiceById.get(w.invoiceId)?.status ?? null : null,
      dueAt: w.dueAt?.toISOString() ?? null, wasOffered: w.offeredFromBidderId != null,
    })),
  });
}

/** Edits settings. Once an auction is public only the safe ones change: bidding may be extended, never shortened or reopened. */
export async function PATCH(req: Request, { params }: { params: Promise<{ auctionId: string }> }) {
  const guard = await guardAuctionsRoute("canManageEvents");
  if ("response" in guard) return guard.response;
  const { auth } = guard;
  const { auctionId } = await params;
  const auction = await loadOwnedAuction(auth, auctionId);
  if (!auction) return auctionNotFound();
  if (auction.status === "SETTLED") return validationError("This auction is finished and can't be edited.", 409);

  const body = await req.json().catch(() => ({}));
  const merged = { ...auction, ...body, startsAt: body.startsAt ?? auction.startsAt, endsAt: body.endsAt ?? auction.endsAt };
  const parsed = validateAuctionInput(merged);
  if (!parsed.ok) return validationError(parsed.error);

  if (auction.status === "DRAFT") {
    await prisma.auction.update({ where: { id: auction.id }, data: parsed.value });
    await prisma.auctionItem.updateMany({ where: { auctionId: auction.id, status: "OPEN", bidCount: 0 }, data: { endsAt: parsed.value.endsAt } });
  } else {
    if (parsed.value.endsAt < auction.endsAt) return validationError("Once an auction is public its closing time can only move later.", 409);
    const { description, goalCents, paymentWindowHours, offerNextBidder, registrationMode, endsAt } = parsed.value;
    await prisma.auction.update({ where: { id: auction.id }, data: { description, goalCents, paymentWindowHours, offerNextBidder, registrationMode, endsAt } });
    if (endsAt > auction.endsAt) await prisma.auctionItem.updateMany({ where: { auctionId: auction.id, status: "OPEN", endsAt: { lt: endsAt } }, data: { endsAt } });
  }
  await logDashboardAction({ churchId: auth.churchId, actorUserId: auth.userId, actorEmail: auth.email, actorRole: auth.rawRole, action: "auction.updated", entityType: "auction", entityId: auction.id, req });
  return NextResponse.json({ success: true });
}
