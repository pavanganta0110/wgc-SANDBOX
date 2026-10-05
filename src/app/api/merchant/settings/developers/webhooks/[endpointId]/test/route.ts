import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { attemptWebhookDelivery } from "@/lib/webhooks/deliverWebhook";

/**
 * Sends a synthetic "test.ping" event to this one endpoint only — does not
 * touch WebhookEvent (that table is real business events only) and does
 * not fan out to any other endpoint, unlike a real emitEvent() call.
 */
export async function POST(req: Request, { params }: { params: Promise<{ endpointId: string }> }) {
  const { endpointId } = await params;
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canManageWebhooks");
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const endpoint = await prisma.webhookEndpoint.findFirst({ where: { id: endpointId, churchId: auth.churchId } });
  if (!endpoint) return NextResponse.json({ error: "Webhook endpoint not found" }, { status: 404 });

  const testEvent = await prisma.webhookEvent.create({
    data: { churchId: auth.churchId, type: "test.ping", dataJson: { message: "This is a test event from WGC.", sentAt: new Date().toISOString() } },
  });
  const delivery = await prisma.webhookDelivery.create({
    data: { webhookEventId: testEvent.id, webhookEndpointId: endpoint.id, churchId: auth.churchId },
  });

  await attemptWebhookDelivery(delivery.id);

  const result = await prisma.webhookDelivery.findUnique({ where: { id: delivery.id } });
  return NextResponse.json({ delivery: result });
}
