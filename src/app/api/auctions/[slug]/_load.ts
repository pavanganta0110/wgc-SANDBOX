import { prisma } from "@/lib/prisma";

/** A public auction by its slug. A draft is invisible to the public: same answer as an unknown slug. */
export async function loadPublicAuction(slug: string) {
  const auction = await prisma.auction.findUnique({ where: { slug } });
  return auction && auction.status !== "DRAFT" ? auction : null;
}
