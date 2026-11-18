import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validationError } from "@/lib/utils/validationError";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { guardAuctionsRoute } from "@/lib/auctions/merchantGuard";
import { generateAuctionSlug, validateAuctionInput } from "@/lib/auctions/auctionConfig";
import { publicAuctionUrl } from "@/lib/auctions/auctionEmails";

export async function GET() {
  const guard = await guardAuctionsRoute("canViewEvents");
  if ("response" in guard) return guard.response;
  const { auth } = guard;

  const auctions = await prisma.auction.findMany({ where: { churchId: auth.churchId }, orderBy: { startsAt: "desc" }, take: 200 });
  const ids = auctions.map((a) => a.id);
  const [itemGroups, bidderGroups] = await Promise.all([
    prisma.auctionItem.groupBy({ by: ["auctionId"], where: { auctionId: { in: ids } }, _count: { _all: true } }),
    prisma.auctionBidder.groupBy({ by: ["auctionId"], where: { auctionId: { in: ids }, status: "APPROVED" }, _count: { _all: true } }),
  ]);
  const items = new Map(itemGroups.map((g) => [g.auctionId, g._count._all]));
  const bidders = new Map(bidderGroups.map((g) => [g.auctionId, g._count._all]));

  return NextResponse.json({
    auctions: auctions.map((a) => ({
      id: a.id, slug: a.slug, title: a.title, status: a.status, format: a.format,
      startsAt: a.startsAt.toISOString(), endsAt: a.endsAt.toISOString(),
      itemCount: items.get(a.id) ?? 0, bidderCount: bidders.get(a.id) ?? 0, publicUrl: publicAuctionUrl(a.slug),
    })),
  });
}

export async function POST(req: Request) {
  const guard = await guardAuctionsRoute("canManageEvents");
  if ("response" in guard) return guard.response;
  const { auth } = guard;

  const body = await req.json().catch(() => ({}));
  const parsed = validateAuctionInput(body);
  if (!parsed.ok) return validationError(parsed.error);

  const auction = await prisma.auction.create({
    data: { ...parsed.value, churchId: auth.churchId, slug: await generateAuctionSlug(parsed.value.title), status: "DRAFT", createdByUserId: auth.userId },
  });
  await logDashboardAction({ churchId: auth.churchId, actorUserId: auth.userId, actorEmail: auth.email, actorRole: auth.rawRole, action: "auction.created", entityType: "auction", entityId: auction.id, req });
  return NextResponse.json({ id: auction.id, slug: auction.slug, publicUrl: publicAuctionUrl(auction.slug) }, { status: 201 });
}
