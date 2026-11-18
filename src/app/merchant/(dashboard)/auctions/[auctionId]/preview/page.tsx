import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { hasPermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { loadPublicAuctionState } from "@/lib/auctions/publicState";
import AuctionClient from "@/app/auction/[slug]/AuctionClient";

export const dynamic = "force-dynamic";

/**
 * What visitors will see, drawn from the auction as it is now (a draft too), read-only. It is shown inside the
 * organizer's screen so every change can be checked before anyone is sent the link.
 */
export default async function AuctionPreviewPage({ params }: { params: Promise<{ auctionId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/login");
    throw err;
  }
  if (!hasPermission(auth, "canViewEvents")) redirect("/merchant/dashboard");

  const { auctionId } = await params;
  const auction = await prisma.auction.findFirst({ where: { id: auctionId, churchId: auth.churchId }, select: { id: true, churchId: true, slug: true } });
  if (!auction) notFound();
  const state = await loadPublicAuctionState(auction, null, { allowDraft: true });
  if (!state) notFound();
  return <AuctionClient slug={auction.slug} previewState={state} />;
}
