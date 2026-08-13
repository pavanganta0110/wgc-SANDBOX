import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { productToPublicShape } from "@/lib/integrations/printful/mapper";

/**
 * Public, unauthenticated — the donor-facing giving page's merchandise
 * section reads from here. Serves WGC's own already-synced database, never
 * calls Printful live on every page load (spec item 61). Returns an empty
 * list (not an error) for any giving link that doesn't have merchandise
 * enabled, so the frontend's "no behavior change unless enabled" guarantee
 * holds even if this endpoint is called defensively.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const link = await prisma.givingLink.findUnique({ where: { publicSlug: slug } });
  if (!link || !link.merchandiseEnabled) {
    return NextResponse.json({ merchandiseEnabled: false, products: [] });
  }

  const connection = await prisma.printfulConnection.findUnique({ where: { churchId: link.churchId } });
  if (!connection || connection.status !== "CONNECTED") {
    return NextResponse.json({ merchandiseEnabled: false, products: [] });
  }

  const assignments = await prisma.givingPageMerchandise.findMany({
    where: { givingPageId: link.id, churchId: link.churchId, enabled: true },
    orderBy: { displayOrder: "asc" },
    include: { product: { include: { variants: true } } },
  });

  const products = assignments
    .filter((a) => a.product.active && a.product.syncStatus !== "UNAVAILABLE")
    .map((a) => ({
      ...productToPublicShape(a.product, a.priceOverride),
      featured: a.featured,
      title: a.customTitle || a.product.name,
      description: a.customDescription || a.product.description,
    }));

  return NextResponse.json({ merchandiseEnabled: true, products });
}
