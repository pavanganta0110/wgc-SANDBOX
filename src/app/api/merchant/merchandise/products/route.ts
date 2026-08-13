import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/permissions";

export async function GET() {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  try {
    requirePermission(auth, "canViewMerchandiseOrders");
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const products = await prisma.merchandiseProduct.findMany({
    where: { churchId: auth.churchId },
    include: { variants: { orderBy: { name: "asc" } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      thumbnailUrl: p.thumbnailUrl,
      currency: p.currency,
      active: p.active,
      visibleOnGivingPage: p.visibleOnGivingPage,
      syncStatus: p.syncStatus,
      lastSyncedAt: p.lastSyncedAt,
      variantCount: p.variants.length,
      variants: p.variants.map((v) => ({
        id: v.id,
        name: v.name,
        size: v.size,
        color: v.color,
        sku: v.sku,
        providerCost: v.providerCost,
        merchantPrice: v.merchantPrice,
        available: v.available,
        stockStatus: v.stockStatus,
        active: v.active,
      })),
    })),
  });
}
