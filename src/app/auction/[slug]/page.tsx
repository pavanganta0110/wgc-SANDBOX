import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AuctionClient from "./AuctionClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const auction = await prisma.auction.findUnique({ where: { slug }, select: { title: true, status: true } });
  return { title: auction && auction.status !== "DRAFT" ? auction.title : "Auction" };
}

export default async function PublicAuctionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const auction = await prisma.auction.findUnique({ where: { slug }, select: { status: true } });
  if (!auction || auction.status === "DRAFT") notFound();
  return <AuctionClient slug={slug} />;
}
