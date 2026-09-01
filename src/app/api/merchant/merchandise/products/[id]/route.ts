import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/permissions";
import { logDashboardAction } from "@/lib/dashboardAudit";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  const product = await prisma.merchandiseProduct.findFirst({ where: { id, churchId: auth.churchId }, include: { variants: true } });
  if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });
  return NextResponse.json({ product });
}

/**
 * Merchant-facing product/variant management: enable/disable, toggle
 * giving-page visibility, and set WGC's own selling price per variant.
 * churchId-scoped throughout — a merchant can never edit another
 * merchant's product (spec item 7).
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  const product = await prisma.merchandiseProduct.findFirst({ where: { id, churchId: auth.churchId } });
  if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (typeof body.active === "boolean") data.active = body.active;
  if (typeof body.visibleOnGivingPage === "boolean") data.visibleOnGivingPage = body.visibleOnGivingPage;

  if (Object.keys(data).length > 0) {
    await prisma.merchandiseProduct.update({ where: { id }, data });
  }

  if (Array.isArray(body.variants)) {
    for (const v of body.variants) {
      if (typeof v?.id !== "string") continue;
      const variantData: Record<string, unknown> = {};
      if (typeof v.merchantPrice === "number" && v.merchantPrice >= 0 && Number.isInteger(v.merchantPrice)) variantData.merchantPrice = v.merchantPrice;
      if (typeof v.active === "boolean") variantData.active = v.active;
      if (Object.keys(variantData).length > 0) {
        await prisma.merchandiseVariant.updateMany({ where: { id: v.id, churchId: auth.churchId, productId: id }, data: variantData });
      }
    }
  }

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.role,
    action: typeof body.active === "boolean" ? (body.active ? "product.enabled" : "product.disabled") : "product.price_changed",
    entityType: "MerchandiseProduct",
    entityId: id,
    metadata: body,
    req,
  });

  const updated = await prisma.merchandiseProduct.findUnique({ where: { id }, include: { variants: true } });
  return NextResponse.json({ success: true, product: updated });
}
