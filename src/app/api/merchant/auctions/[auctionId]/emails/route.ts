import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auctionNotFound, guardAuctionsRoute, loadOwnedAuction } from "@/lib/auctions/merchantGuard";
import { EMAIL_KIND_INFO, parseEmailSettings } from "@/lib/auctions/emailSettings";

/** The organization's wording for the automatic emails, and what each email is for. */
export async function GET(_req: Request, { params }: { params: Promise<{ auctionId: string }> }) {
  const guard = await guardAuctionsRoute("canViewEvents");
  if ("response" in guard) return guard.response;
  const { auth } = guard;
  const { auctionId } = await params;
  const auction = await loadOwnedAuction(auth, auctionId);
  if (!auction) return auctionNotFound();
  return NextResponse.json({ kinds: EMAIL_KIND_INFO, settings: parseEmailSettings(auction.emailSettingsJson) });
}

/** Saves the wording. Only the subject and the organization's own message can change; the rest of each email is fixed. */
export async function PUT(req: Request, { params }: { params: Promise<{ auctionId: string }> }) {
  const guard = await guardAuctionsRoute("canManageEvents");
  if ("response" in guard) return guard.response;
  const { auth } = guard;
  const { auctionId } = await params;
  const auction = await loadOwnedAuction(auth, auctionId);
  if (!auction) return auctionNotFound();

  const body = await req.json().catch(() => ({}));
  const cleaned = parseEmailSettings(body.settings);
  // Keep the cooldown clock: saving wording must not reset it.
  const existing = parseEmailSettings(auction.emailSettingsJson);
  if (existing.lastAnnouncementAt) cleaned.lastAnnouncementAt = existing.lastAnnouncementAt;
  await prisma.auction.update({ where: { id: auction.id }, data: { emailSettingsJson: cleaned as unknown as Prisma.InputJsonValue } });
  return NextResponse.json({ success: true, settings: cleaned });
}
