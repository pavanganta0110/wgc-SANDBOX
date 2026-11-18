import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { isEmbedOriginAllowed, parseEmbedAllowedDomains } from "@/lib/giving/embedDomainCheck";
import AuctionClient from "@/app/auction/[slug]/AuctionClient";

export const dynamic = "force-dynamic";
// An embedded copy is not a page of its own to find in a search engine.
export const metadata: Metadata = { title: "Auction", robots: { index: false, follow: false } };

/**
 * The auction page without any WGC chrome, meant to sit in a frame on an organization's own website (loaded by
 * public/embed/wgc-auction.js, or a plain iframe). /embed/* already allows cross-origin framing (next.config.ts); an
 * organization's optional approved-websites list is enforced here, the same way as the giving page and events.
 * Registering and bidding both work in the frame: nothing in them takes a card (winners pay later from their invoice).
 */
export default async function EmbedAuctionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const auction = await prisma.auction.findUnique({ where: { slug }, select: { status: true, churchId: true } });
  if (!auction || auction.status === "DRAFT") notFound();

  const church = await prisma.church.findUnique({ where: { id: auction.churchId }, select: { name: true, embedDomainRestrictionEnabled: true, embedAllowedDomainsJson: true } });
  if (church?.embedDomainRestrictionEnabled) {
    const referer = (await headers()).get("referer");
    if (!isEmbedOriginAllowed(referer, parseEmbedAllowedDomains(church.embedAllowedDomainsJson))) {
      return <div className="p-6 text-center text-sm text-slate-600">This auction is not authorized to be embedded on this website. Please contact {church.name}.</div>;
    }
  }
  return <AuctionClient slug={slug} embedded />;
}
