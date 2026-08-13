import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/permissions";
import { orderToDetailShape } from "@/lib/integrations/printful/mapper";

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

  const order = await prisma.merchandiseOrder.findFirst({ where: { id, churchId: auth.churchId }, include: { items: true } });
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  const donor = order.donorId ? await prisma.donor.findUnique({ where: { id: order.donorId }, select: { id: true, name: true, email: true, phone: true } }) : null;
  let finixTransfer = null as { finixTransferId: string } | null;
  if (order.paymentId) {
    const payment = await prisma.payment.findUnique({ where: { id: order.paymentId }, select: { finixTransferId: true, donationAmountCents: true } });
    if (payment?.finixTransferId) finixTransfer = { finixTransferId: payment.finixTransferId };
  }

  return NextResponse.json({ order: orderToDetailShape(order as any), donor, finixTransfer });
}
