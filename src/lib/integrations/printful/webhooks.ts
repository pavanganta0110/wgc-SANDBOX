import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { mapProviderOrderStatusToWgc } from "./mapper";
import type { ParsedWebhookEvent } from "./types";

/**
 * Idempotent webhook processing — mirrors FinixWebhookEvent's pattern
 * exactly (unique on provider + externalEventId, row created before any
 * processing happens, always returns success to the caller). See spec
 * item 44/45.
 */
export async function recordAndProcessWebhookEvent(params: { event: ParsedWebhookEvent; churchId: string | null; connectionId: string | null }) {
  const existing = await prisma.merchandiseWebhookEvent.findUnique({
    where: { provider_externalEventId: { provider: "PRINTFUL", externalEventId: params.event.externalEventId } },
  });
  if (existing) {
    return { alreadyProcessed: true, eventId: existing.id };
  }

  const row = await prisma.merchandiseWebhookEvent.create({
    data: {
      provider: "PRINTFUL",
      externalEventId: params.event.externalEventId,
      churchId: params.churchId,
      connectionId: params.connectionId,
      eventType: params.event.eventType,
      payloadJson: params.event.raw as any,
      status: "PENDING",
    },
  });

  try {
    await applyWebhookEventToOrder(params.event);
    await prisma.merchandiseWebhookEvent.update({ where: { id: row.id }, data: { status: "PROCESSED", processedAt: new Date(), processingAttempts: { increment: 1 } } });
    return { alreadyProcessed: false, eventId: row.id };
  } catch (err: any) {
    await prisma.merchandiseWebhookEvent.update({ where: { id: row.id }, data: { status: "FAILED", errorMessage: err?.message ?? "Unknown error", processingAttempts: { increment: 1 } } });
    // Never throw back to the webhook route — same "always 200, log
    // internally" pattern as the Finix webhook handler, so a transient
    // failure never causes the provider to interpret it as an endpoint
    // outage (and the row above already preserves it for retry/inspection).
    console.error("Printful webhook event processing failed:", err);
    return { alreadyProcessed: false, eventId: row.id, error: err?.message };
  }
}

async function applyWebhookEventToOrder(event: ParsedWebhookEvent) {
  if (!event.externalOrderId) return; // PRODUCT_UPDATED / STOCK_UPDATED events don't touch an order

  const order = await prisma.merchandiseOrder.findFirst({ where: { externalOrderId: event.externalOrderId } });
  if (!order) {
    console.warn(`Printful webhook: no MerchandiseOrder found for externalOrderId ${event.externalOrderId}`);
    return;
  }

  const data: Record<string, unknown> = { externalStatus: event.status ?? undefined };
  if (event.trackingNumber) data.trackingNumber = event.trackingNumber;
  if (event.trackingUrl) data.trackingUrl = event.trackingUrl;
  if (event.carrier) data.carrier = event.carrier;

  if (event.status) {
    const mapped = mapProviderOrderStatusToWgc(event.status);
    data.status = mapped.status;
    data.fulfillmentStatus = mapped.fulfillmentStatus;
    if (event.status === "SHIPPED") data.shippedAt = new Date();
    if (event.status === "DELIVERED") data.deliveredAt = new Date();
    if (event.status === "CANCELLED") data.cancelledAt = new Date();
    if (event.status === "FULFILLED" || event.status === "IN_FULFILLMENT") data.fulfilledAt = new Date();
  }

  await prisma.merchandiseOrder.update({ where: { id: order.id }, data });

  await logDashboardAction({
    churchId: order.churchId,
    action: "merchandise_order.webhook_status_updated",
    entityType: "MerchandiseOrder",
    entityId: order.id,
    metadata: { eventType: event.eventType, status: event.status },
  });
}

/**
 * Sandbox-only mock webhook simulator (spec item 46) — lets us exercise the
 * full order lifecycle (accepted -> in fulfillment -> shipped -> delivered
 * / failed / cancelled) without any real Printful webhook delivery. Never
 * exposed on a public route; only reachable from an authenticated
 * merchant-dashboard action in mock mode. Delegates to
 * MockPrintfulProvider.transitionMockOrder for the actual state
 * transition, then feeds the resulting event through the exact same
 * recordAndProcessWebhookEvent path a real webhook would use — so this is
 * a genuine end-to-end test of the webhook pipeline, not a shortcut around
 * it.
 */
export async function simulateMockWebhookEvent(params: { orderId: string; churchId: string; nextStatus: "IN_FULFILLMENT" | "SHIPPED" | "DELIVERED" | "FAILED" | "CANCELLED" }) {
  const order = await prisma.merchandiseOrder.findFirst({ where: { id: params.orderId, churchId: params.churchId } });
  if (!order || !order.externalOrderId) throw new Error("Order has not been submitted to a provider yet.");

  const { MockPrintfulProvider } = await import("./mockProvider");
  const provider = new MockPrintfulProvider(params.churchId);
  const event = provider.transitionMockOrder(order.externalOrderId, params.nextStatus);

  return recordAndProcessWebhookEvent({ event, churchId: params.churchId, connectionId: order.printfulConnectionId });
}
