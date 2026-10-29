import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { decryptSecret, deserializeEnvelope } from "@/lib/webhooks/encryption";
import { postSignedWebhook } from "@/lib/webhooks/postSignedWebhook";
import { computeNextRetryAt, MAX_DELIVERY_ATTEMPTS, AUTO_DISABLE_FAILURE_THRESHOLD } from "@/lib/webhooks/retryPolicy";
import { createAuditLog } from "@/lib/audit";

/**
 * Delivery of organization events to a partner's one webhook endpoint. Same
 * signing, retry and auto-disable rules as the organization webhooks
 * (src/lib/webhooks), kept separate so that path is untouched. The payload is
 * the organization event plus `organization` {id, name, reference}, so the
 * partner can tell which of its organizations it came from.
 */

export const PARTNER_DEFAULT_EVENTS = ["donation.created"];

/**
 * Called by emitEvent after the event is stored. Queues a delivery when the
 * organization belongs to a partner whose endpoint is active and subscribed to
 * this event type. Never throws.
 */
export async function queuePartnerWebhookDelivery(params: { eventId: string; type: string; churchId: string }): Promise<void> {
  try {
    const church = await prisma.church.findUnique({ where: { id: params.churchId }, select: { partnerId: true } });
    if (!church?.partnerId) return;

    const endpoint = await prisma.partnerWebhookEndpoint.findUnique({
      where: { partnerId: church.partnerId },
      select: { id: true, status: true, subscribedEventsJson: true },
    });
    if (!endpoint || endpoint.status !== "ACTIVE") return;
    const events = Array.isArray(endpoint.subscribedEventsJson) ? (endpoint.subscribedEventsJson as string[]) : [];
    if (!events.includes(params.type)) return;

    const delivery = await prisma.partnerWebhookDelivery.create({
      data: { webhookEventId: params.eventId, partnerId: church.partnerId, partnerEndpointId: endpoint.id, churchId: params.churchId },
    });
    void attemptPartnerWebhookDelivery(delivery.id).catch(() => {
      // Failures are recorded on the row; this only prevents an unhandled rejection.
    });
  } catch (err) {
    console.error(`queuePartnerWebhookDelivery failed for event=${params.eventId}:`, err);
  }
}

/** One attempt, recorded on the delivery row and the endpoint. Never throws. */
export async function attemptPartnerWebhookDelivery(deliveryId: string): Promise<void> {
  const delivery = await prisma.partnerWebhookDelivery.findUnique({ where: { id: deliveryId } });
  if (!delivery || delivery.status === "SUCCEEDED" || delivery.status === "ABANDONED") return;

  const [event, endpoint, church] = await Promise.all([
    prisma.webhookEvent.findUnique({ where: { id: delivery.webhookEventId } }),
    prisma.partnerWebhookEndpoint.findUnique({ where: { id: delivery.partnerEndpointId } }),
    prisma.church.findUnique({ where: { id: delivery.churchId }, select: { id: true, name: true, partnerId: true, partnerReference: true } }),
  ]);
  if (!event || !endpoint || endpoint.status !== "ACTIVE" || !church || church.partnerId !== delivery.partnerId) {
    await prisma.partnerWebhookDelivery.update({ where: { id: deliveryId }, data: { status: "ABANDONED", errorMessage: "Endpoint no longer active or organization no longer linked" } });
    return;
  }

  const rawBody = JSON.stringify({
    id: event.id,
    type: event.type,
    createdAt: event.createdAt.toISOString(),
    organization: { id: church.id, name: church.name, reference: church.partnerReference },
    data: event.dataJson,
  });

  let result;
  try {
    const secret = decryptSecret(deserializeEnvelope(endpoint.signingSecretEncrypted));
    result = await postSignedWebhook({ url: endpoint.url, secret, rawBody, eventId: event.id, eventType: event.type });
  } catch (err) {
    result = { ok: false, error: err instanceof Error ? err.message : "Unknown delivery error", statusCode: undefined, bodySnippet: undefined, timestamp: Math.floor(Date.now() / 1000) };
  }

  const attemptCount = delivery.attemptCount + 1;
  const now = new Date();
  if (result.ok) {
    await prisma.$transaction([
      prisma.partnerWebhookDelivery.update({
        where: { id: deliveryId },
        data: { status: "SUCCEEDED", attemptCount, lastAttemptAt: now, nextRetryAt: null, responseStatusCode: result.statusCode, responseBodySnippet: result.bodySnippet, errorMessage: null },
      }),
      prisma.partnerWebhookEndpoint.update({ where: { id: endpoint.id }, data: { consecutiveFailures: 0, lastDeliveryAt: now, lastSuccessAt: now } }),
    ]);
    return;
  }

  const exhausted = attemptCount >= MAX_DELIVERY_ATTEMPTS;
  const consecutiveFailures = endpoint.consecutiveFailures + 1;
  const autoDisable = consecutiveFailures >= AUTO_DISABLE_FAILURE_THRESHOLD;
  await prisma.$transaction([
    prisma.partnerWebhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: exhausted ? "ABANDONED" : "FAILED",
        attemptCount,
        lastAttemptAt: now,
        nextRetryAt: exhausted ? null : computeNextRetryAt(attemptCount, now),
        responseStatusCode: result.statusCode ?? null,
        responseBodySnippet: result.bodySnippet ?? null,
        errorMessage: result.error ?? "Unknown error",
      },
    }),
    prisma.partnerWebhookEndpoint.update({
      where: { id: endpoint.id },
      data: {
        consecutiveFailures,
        lastDeliveryAt: now,
        ...(autoDisable ? { status: "DISABLED_AUTO", disabledAt: now, disabledReason: `Auto-disabled after ${consecutiveFailures} consecutive failed deliveries` } : {}),
      },
    }),
  ]);
  if (autoDisable) {
    await createAuditLog({ action: "PARTNER_WEBHOOK_AUTO_DISABLED", metadata: { partnerId: endpoint.partnerId, consecutiveFailures } });
  }
}

/**
 * Sends a test event so the partner can check its receiver and signature
 * verification. Not stored as a delivery; updates the endpoint's last-delivery
 * times like a real one.
 */
export async function sendPartnerTestEvent(partnerId: string): Promise<{ ok: boolean; statusCode?: number; error?: string }> {
  const endpoint = await prisma.partnerWebhookEndpoint.findUnique({ where: { partnerId } });
  if (!endpoint) return { ok: false, error: "No webhook is set up yet." };

  const eventId = `evt_test_${crypto.randomBytes(8).toString("hex")}`;
  const rawBody = JSON.stringify({
    id: eventId,
    type: "webhook.test",
    createdAt: new Date().toISOString(),
    organization: null,
    data: { message: "This is a test event from WGC Payments." },
  });
  let result;
  try {
    const secret = decryptSecret(deserializeEnvelope(endpoint.signingSecretEncrypted));
    result = await postSignedWebhook({ url: endpoint.url, secret, rawBody, eventId, eventType: "webhook.test" });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not sign the test event." };
  }

  const now = new Date();
  await prisma.partnerWebhookEndpoint.update({
    where: { id: endpoint.id },
    data: result.ok ? { lastDeliveryAt: now, lastSuccessAt: now } : { lastDeliveryAt: now },
  });
  return { ok: result.ok, statusCode: result.statusCode, error: result.error };
}
