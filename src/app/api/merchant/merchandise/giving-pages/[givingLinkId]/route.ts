import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/permissions";
import { logDashboardAction } from "@/lib/dashboardAudit";

/** Which products are assigned/visible on a specific giving page, plus
 * every active product available to assign (spec item 11/28). */
export async function GET(_req: Request, { params }: { params: Promise<{ givingLinkId: string }> }) {
  const { givingLinkId } = await params;
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const link = await prisma.givingLink.findFirst({ where: { id: givingLinkId, churchId: auth.churchId } });
  if (!link) return NextResponse.json({ error: "Giving page not found." }, { status: 404 });

  const [assignments, availableProducts] = await Promise.all([
    prisma.givingPageMerchandise.findMany({ where: { givingPageId: givingLinkId, churchId: auth.churchId }, orderBy: { displayOrder: "asc" } }),
    prisma.merchandiseProduct.findMany({ where: { churchId: auth.churchId, active: true, syncStatus: { not: "UNAVAILABLE" } }, include: { variants: true } }),
  ]);

  return NextResponse.json({
    merchandiseEnabled: link.merchandiseEnabled,
    assignments,
    availableProducts: availableProducts.map((p) => ({ id: p.id, name: p.name, thumbnailUrl: p.thumbnailUrl, variantCount: p.variants.length })),
  });
}

/**
 * Replaces the full assignment set for this giving page in one call —
 * simpler and less error-prone than incremental add/remove endpoints for
 * a merchant picking products from a list (spec item 11). Also flips
 * GivingLink.merchandiseEnabled — purely additive, defaults false, so a
 * page never gains a behavior change unless the merchant explicitly
 * enables it here.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ givingLinkId: string }> }) {
  const { givingLinkId } = await params;
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  try {
    requirePermission(auth, "canManageMerchandise");
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const link = await prisma.givingLink.findFirst({ where: { id: givingLinkId, churchId: auth.churchId } });
  if (!link) return NextResponse.json({ error: "Giving page not found." }, { status: 404 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const merchandiseEnabled = Boolean(body.merchandiseEnabled);
  const items: { productId: string; enabled?: boolean; displayOrder?: number; featured?: boolean; customTitle?: string | null; customDescription?: string | null; priceOverride?: number | null }[] = Array.isArray(body.items) ? body.items : [];

  // Validate every productId actually belongs to this church before
  // writing anything — never trust a client-submitted productId blindly.
  const validProductIds = new Set(
    (await prisma.merchandiseProduct.findMany({ where: { churchId: auth.churchId, id: { in: items.map((i) => i.productId) } }, select: { id: true } })).map((p) => p.id)
  );

  await prisma.$transaction(async (tx) => {
    await tx.givingLink.update({ where: { id: givingLinkId }, data: { merchandiseEnabled } });
    await tx.givingPageMerchandise.deleteMany({ where: { givingPageId: givingLinkId, churchId: auth.churchId } });
    for (const [index, item] of items.entries()) {
      if (!validProductIds.has(item.productId)) continue;
      await tx.givingPageMerchandise.create({
        data: {
          churchId: auth.churchId,
          givingPageId: givingLinkId,
          productId: item.productId,
          enabled: item.enabled ?? true,
          displayOrder: item.displayOrder ?? index,
          featured: Boolean(item.featured),
          customTitle: item.customTitle ?? null,
          customDescription: item.customDescription ?? null,
          priceOverride: typeof item.priceOverride === "number" ? item.priceOverride : null,
        },
      });
    }
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.role,
    action: "giving_page.merchandise_enabled",
    entityType: "GivingLink",
    entityId: givingLinkId,
    metadata: { merchandiseEnabled, productCount: items.length },
    req,
  });

  return NextResponse.json({ success: true });
}
