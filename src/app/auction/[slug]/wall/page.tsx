import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import WallClient from "./WallClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Live auction" };

/** The big-screen view for the room: nothing to click, it just updates. */
export default async function AuctionWallPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const auction = await prisma.auction.findUnique({ where: { slug }, select: { status: true } });
  if (!auction || auction.status === "DRAFT") notFound();
  return <WallClient slug={slug} />;
}
