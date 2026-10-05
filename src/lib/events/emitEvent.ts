import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { WgcEventType } from "@/lib/events/types";
import { attemptWebhookDelivery } from "@/lib/webhooks/deliverWebhook";

/**
 * The single entry point for "something happened" anywhere in the app.
 * Persists a durable WebhookEvent row (the source of truth other
 * consumers — webhook delivery today, analytics/Zapier/Make later — can
 * all read from) and, for webhook delivery specifically, immediately
 * attempts a first delivery to every ACTIVE endpoint subscribed to this
 * event type for this church.
 *
 * Deliberately never throws: a business-logic call site emitting
 * "donation.created" after a successful charge must never have that
 * charge's response derailed by an event-system failure. Every caller
 * should still wrap its own emitEvent() call in a try/catch as defensive
 * belt-and-suspenders (matching the existing sendDonationReceipt/
 * notifyMerchantOfNewDonation pattern this call sits alongside), but the
 * function itself also swallows its own errors as a second layer.
 *
 * Delivery attempts are fired with `void` (not awaited) so a slow or
 * unreachable merchant endpoint never adds latency to the request that
 * triggered the event — the retry cron (src/app/api/cron/webhook-retry)
 * is the backstop for anything that doesn't complete inline.
 */
export async function emitEvent(params: { type: WgcEventType; churchId: string; data: Record<string, unknown> }): Promise<void> {
  try {
    const event = await prisma.webhookEvent.create({
      data: { churchId: params.churchId, type: params.type, dataJson: params.data as Prisma.InputJsonValue },
    });

    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { churchId: params.churchId, status: "ACTIVE" },
      select: { id: true, subscribedEventsJson: true },
    });

    const subscribed = endpoints.filter((e) => {
      const events = Array.isArray(e.subscribedEventsJson) ? (e.subscribedEventsJson as string[]) : [];
      return events.includes(params.type);
    });
    if (subscribed.length === 0) return;

    const deliveries = await prisma.$transaction(
      subscribed.map((endpoint) =>
        prisma.webhookDelivery.create({
          data: { webhookEventId: event.id, webhookEndpointId: endpoint.id, churchId: params.churchId },
        })
      )
    );

    for (const delivery of deliveries) {
      void attemptWebhookDelivery(delivery.id).catch(() => {
        // attemptWebhookDelivery already records failures on the row itself;
        // this catch exists only so an unexpected throw can never become an
        // unhandled promise rejection.
      });
    }
  } catch (err) {
    console.error(`emitEvent failed for type=${params.type} churchId=${params.churchId}:`, err);
  }
}
