import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";

export async function GET(req: Request, { params }: { params: Promise<{ endpointId: string }> }) {
  const { endpointId } = await params;
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canManageWebhooks");
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const endpoint = await prisma.webhookEndpoint.findFirst({ where: { id: endpointId, churchId: auth.churchId }, select: { id: true } });
  if (!endpoint) return NextResponse.json({ error: "Webhook endpoint not found" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 50));

  const deliveries = await prisma.webhookDelivery.findMany({
    where: { webhookEndpointId: endpointId, churchId: auth.churchId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const eventIds = Array.from(new Set(deliveries.map((d) => d.webhookEventId)));
  const events = eventIds.length
    ? await prisma.webhookEvent.findMany({ where: { id: { in: eventIds } }, select: { id: true, type: true, dataJson: true, createdAt: true } })
    : [];
  const eventById = new Map(events.map((e) => [e.id, e]));

  return NextResponse.json({
    deliveries: deliveries.map((d) => ({ ...d, event: eventById.get(d.webhookEventId) ?? null })),
  });
}
