import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/permissions";

export async function GET(req: Request) {
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

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const orders = await prisma.merchandiseOrder.findMany({
    where: { churchId: auth.churchId, ...(status && status !== "ALL" ? { status } : {}) },
    include: { items: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const donorIds = [...new Set(orders.map((o) => o.donorId).filter((id): id is string => Boolean(id)))];
  const donors = donorIds.length ? await prisma.donor.findMany({ where: { id: { in: donorIds } }, select: { id: true, name: true, email: true } }) : [];
  const donorById = new Map(donors.map((d) => [d.id, d]));

  return NextResponse.json({
    orders: orders.map((o) => ({
      id: o.id,
      wgcOrderNumber: o.wgcOrderNumber,
      donor: o.donorId ? donorById.get(o.donorId) ?? null : null,
      customerEmail: o.customerEmail,
      itemCount: o.items.reduce((sum, i) => sum + i.quantity, 0),
      merchandiseAmount: o.totalMerchandiseAmount,
      status: o.status,
      fulfillmentStatus: o.fulfillmentStatus,
      paymentStatus: o.paymentStatus,
      trackingNumber: o.trackingNumber,
      createdAt: o.createdAt,
    })),
  });
}
