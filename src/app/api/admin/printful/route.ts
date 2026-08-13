import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";

/**
 * WGC platform-admin visibility (spec item 49) — never returns raw access
 * tokens (accessTokenEncrypted/refreshTokenEncrypted are excluded from the
 * select entirely, not just omitted after the fact, so there is no path
 * where they could leak through this response).
 */
export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const connections = await prisma.printfulConnection.findMany({
    select: {
      id: true,
      churchId: true,
      status: true,
      connectionType: true,
      printfulStoreId: true,
      lastConnectedAt: true,
      lastSyncAt: true,
      lastSyncStatus: true,
      lastSyncError: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  const churchIds = connections.map((c) => c.churchId);
  const [churches, productCounts, orderCounts, failedOrderCounts, webhookErrorCounts] = await Promise.all([
    prisma.church.findMany({ where: { id: { in: churchIds } }, select: { id: true, name: true } }),
    prisma.merchandiseProduct.groupBy({ by: ["churchId"], where: { churchId: { in: churchIds } }, _count: { _all: true } }),
    prisma.merchandiseOrder.groupBy({ by: ["churchId"], where: { churchId: { in: churchIds } }, _count: { _all: true } }),
    prisma.merchandiseOrder.groupBy({ by: ["churchId"], where: { churchId: { in: churchIds }, status: "FAILED" }, _count: { _all: true } }),
    prisma.merchandiseWebhookEvent.groupBy({ by: ["churchId"], where: { churchId: { in: churchIds }, status: "FAILED" }, _count: { _all: true } }),
  ]);

  const churchById = new Map(churches.map((c) => [c.id, c]));
  const countMap = (rows: { churchId: string | null; _count: { _all: number } }[]) => new Map(rows.map((r) => [r.churchId, r._count._all]));
  const products = countMap(productCounts);
  const orders = countMap(orderCounts);
  const failedOrders = countMap(failedOrderCounts);
  const webhookErrors = countMap(webhookErrorCounts);

  return NextResponse.json({
    connections: connections.map((c) => ({
      churchId: c.churchId,
      churchName: churchById.get(c.churchId)?.name ?? "Unknown",
      status: c.status,
      connectionType: c.connectionType,
      storeId: c.printfulStoreId,
      lastConnectedAt: c.lastConnectedAt,
      lastSyncAt: c.lastSyncAt,
      lastSyncStatus: c.lastSyncStatus,
      lastSyncError: c.lastSyncError,
      productsSynced: products.get(c.churchId) ?? 0,
      totalOrders: orders.get(c.churchId) ?? 0,
      failedOrders: failedOrders.get(c.churchId) ?? 0,
      webhookErrors: webhookErrors.get(c.churchId) ?? 0,
    })),
  });
}
